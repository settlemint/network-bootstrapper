import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import type { V1ConfigMap } from "@kubernetes/client-node";
import { Command } from "commander";

import {
  ARTIFACT_ANNOTATION_KEY,
  ARTIFACT_VALUES,
} from "../../../constants/artifact-annotations.ts";
import {
  createKubernetesClient,
  extractKubernetesError,
  getStatusCode,
  type KubernetesClient,
} from "../../integrations/kubernetes/kubernetes.client.ts";

const DEFAULT_OUTPUT_DIRECTORY = "/data/abi";
const PAGE_SIZE = 100;
const RESOURCE_EXPIRED_STATUS = 410;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_INTERNAL_SERVER_ERROR = 500;
const HTTP_BAD_GATEWAY = 502;
const HTTP_SERVICE_UNAVAILABLE = 503;
const HTTP_GATEWAY_TIMEOUT = 504;
const RETRYABLE_STATUS_CODES = new Set([
  HTTP_TOO_MANY_REQUESTS,
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_BAD_GATEWAY,
  HTTP_SERVICE_UNAVAILABLE,
  HTTP_GATEWAY_TIMEOUT,
]);
const MAX_PAGE_RETRY_ATTEMPTS = 5;
const MAX_RESNAPSHOT_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 100;
const CONTINUE_TOKEN_FIELDS = ["_continue", "continue"] as const;
const SAFE_FILENAME_PATTERN = /[\\/]/g;

type ListConfigMapRequest = Parameters<
  KubernetesClient["client"]["listNamespacedConfigMap"]
>[0];

type ListConfigMapResponse = Awaited<
  ReturnType<KubernetesClient["client"]["listNamespacedConfigMap"]>
>;

type ConfigMapListMetadata = {
  continueToken?: string;
};

type DownloadStatistics = {
  configMaps: number;
  files: number;
};

type CommanderOptions = {
  outputDirectory?: string;
};

type DownloadAbiOptions = {
  outputDirectory: string;
};

type DownloadAbiDependencies = {
  createContext: () => Promise<KubernetesClient>;
  pause: (milliseconds: number) => Promise<void>;
};

type ConfigMapListPayload = {
  items?: readonly V1ConfigMap[];
  metadata?: Record<string, unknown>;
};

const extractListPayload = (payload: unknown): ConfigMapListPayload => {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  if ("body" in payload && payload.body) {
    const body = (payload as { body?: ConfigMapListPayload }).body;
    if (body && typeof body === "object") {
      return body;
    }
  }

  if ("items" in payload || "metadata" in payload) {
    return payload as ConfigMapListPayload;
  }

  return {};
};

const toConfigMapList = (payload: unknown): readonly V1ConfigMap[] => {
  const list = extractListPayload(payload);
  return Array.isArray(list.items) ? list.items : [];
};

const getListMetadata = (payload: unknown): ConfigMapListMetadata => {
  const list = extractListPayload(payload);
  const metadata = list.metadata;
  if (!metadata || typeof metadata !== "object") {
    return {};
  }

  const record = metadata as Record<string, unknown>;
  for (const field of CONTINUE_TOKEN_FIELDS) {
    const candidate = record[field];
    if (typeof candidate === "string" && candidate.length > 0) {
      return { continueToken: candidate };
    }
  }

  return {};
};

const ensureDirectory = async (path: string): Promise<void> => {
  await mkdir(path, { recursive: true });
};

const sanitizeDirectory = (raw: string | undefined): string => {
  if (!raw) {
    return DEFAULT_OUTPUT_DIRECTORY;
  }
  const trimmed = raw.trim();
  return trimmed.length === 0 ? DEFAULT_OUTPUT_DIRECTORY : trimmed;
};

const writeConfigMap = async (
  baseDirectory: string,
  configMap: V1ConfigMap
): Promise<number> => {
  const name = configMap.metadata?.name;
  if (!name) {
    return 0;
  }

  const entries = Object.entries(configMap.data ?? {});
  if (entries.length === 0) {
    return 0;
  }

  const targetDirectory = join(baseDirectory, name);
  await ensureDirectory(targetDirectory);

  let written = 0;
  for (const [key, value] of entries) {
    if (typeof value !== "string") {
      continue;
    }
    const safeKey = key.replace(SAFE_FILENAME_PATTERN, "_");
    const targetPath = join(targetDirectory, safeKey);
    await Bun.write(targetPath, value);
    written += 1;
    process.stdout.write(
      `[download-abi] Wrote ${safeKey} from ${name} to ${targetDirectory}.\n`
    );
  }

  return written;
};

const syncAbiConfigMaps = async (
  context: KubernetesClient,
  baseDirectory: string,
  pause: DownloadAbiDependencies["pause"]
): Promise<DownloadStatistics> => {
  let continueToken: string | undefined;
  let retryAttempts = 0;
  let resnapshotAttempts = 0;
  const seenTokens = new Set<string>();
  const totals: DownloadStatistics = { configMaps: 0, files: 0 };

  for (;;) {
    const request = {
      namespace: context.namespace,
      limit: PAGE_SIZE,
    } as ListConfigMapRequest & Record<string, unknown>;

    if (continueToken) {
      request._continue = continueToken;
      request.continue = continueToken;
    }

    let response: ListConfigMapResponse;
    try {
      response = await context.client.listNamespacedConfigMap(request);
      retryAttempts = 0;
      resnapshotAttempts = 0;
    } catch (error) {
      const statusCode = getStatusCode(error);
      if (statusCode === RESOURCE_EXPIRED_STATUS) {
        resnapshotAttempts += 1;
        if (resnapshotAttempts > MAX_RESNAPSHOT_ATTEMPTS) {
          throw new Error(
            "Failed to download ABI ConfigMaps after repeated resource snapshot expirations."
          );
        }
        continueToken = undefined;
        seenTokens.clear();
        await pause(RETRY_BASE_DELAY_MS * resnapshotAttempts);
        continue;
      }

      if (
        statusCode &&
        RETRYABLE_STATUS_CODES.has(statusCode) &&
        retryAttempts < MAX_PAGE_RETRY_ATTEMPTS
      ) {
        retryAttempts += 1;
        await pause(RETRY_BASE_DELAY_MS * 2 ** (retryAttempts - 1));
        continue;
      }

      throw new Error(
        `Failed to list ABI ConfigMaps: ${extractKubernetesError(error)}`
      );
    }

    const items = toConfigMapList(response);
    for (const item of items) {
      const annotation = item.metadata?.annotations?.[ARTIFACT_ANNOTATION_KEY];
      if (annotation !== ARTIFACT_VALUES.abi) {
        continue;
      }

      const filesWritten = await writeConfigMap(baseDirectory, item);
      totals.configMaps += 1;
      totals.files += filesWritten;
    }

    const { continueToken: nextToken } = getListMetadata(response);
    if (!nextToken) {
      return totals;
    }

    if (seenTokens.has(nextToken)) {
      throw new Error(
        `Detected repeated Kubernetes pagination token ${nextToken}; aborting to avoid an infinite loop.`
      );
    }

    seenTokens.add(nextToken);
    continueToken = nextToken;
  }
};

const defaultDependencies: DownloadAbiDependencies = {
  createContext: () =>
    createKubernetesClient({
      checkSecretAccess: false,
    }),
  pause: async (milliseconds: number) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

const downloadAbi = async (
  { outputDirectory }: DownloadAbiOptions,
  deps: DownloadAbiDependencies = defaultDependencies
): Promise<void> => {
  const sanitizedDirectory = sanitizeDirectory(outputDirectory);
  const context = await deps.createContext();
  process.stdout.write(
    `[download-abi] Using namespace ${context.namespace}; writing to ${sanitizedDirectory}.\n`
  );
  await ensureDirectory(sanitizedDirectory);

  const { configMaps, files } = await syncAbiConfigMaps(
    context,
    sanitizedDirectory,
    deps.pause
  );

  if (configMaps === 0) {
    process.stdout.write("[download-abi] No ABI ConfigMaps found.\n");
    return;
  }

  process.stdout.write(
    `[download-abi] Synced ${configMaps} ConfigMaps with ${files} files.\n`
  );
};

const createDownloadAbiCommand = (): Command =>
  new Command("download-abi")
    .description(
      "Download ABI ConfigMaps annotated with settlemint.com/artifact=abi into a local directory."
    )
    .option(
      "--output-directory <path>",
      "Directory to write ABI JSON files.",
      DEFAULT_OUTPUT_DIRECTORY
    )
    .action(async (options: CommanderOptions) => {
      const outputDirectory = sanitizeDirectory(options.outputDirectory);
      await downloadAbi({ outputDirectory });
    });

export type { DownloadAbiOptions };
export { createDownloadAbiCommand, downloadAbi };
