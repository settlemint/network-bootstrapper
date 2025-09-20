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
  type KubernetesClient,
} from "../../integrations/kubernetes/kubernetes.client.ts";

const DEFAULT_OUTPUT_DIRECTORY = "/data/abi";
const CONTINUE_TOKEN_FIELD = "continue";
const SAFE_FILENAME_PATTERN = /[\\/]/g;

type CommanderOptions = {
  outputDirectory?: string;
};

type DownloadAbiOptions = {
  outputDirectory: string;
};

type DownloadAbiDependencies = {
  createContext: () => Promise<KubernetesClient>;
};

const toConfigMapList = (payload: unknown): readonly V1ConfigMap[] => {
  if (!payload) {
    return [];
  }

  const list = ((): {
    items?: readonly V1ConfigMap[];
    metadata?: { continue?: string };
  } => {
    if (typeof payload === "object") {
      if ("body" in payload && payload.body) {
        return payload.body as {
          items?: readonly V1ConfigMap[];
          metadata?: { continue?: string };
        };
      }
      if ("items" in payload) {
        return payload as {
          items?: readonly V1ConfigMap[];
          metadata?: { continue?: string };
        };
      }
    }
    return {};
  })();

  return list.items ?? [];
};

const getContinueToken = (payload: unknown): string | undefined => {
  if (!payload || typeof payload !== "object") {
    return;
  }

  const source = "body" in payload && payload.body ? payload.body : payload;
  if (
    source &&
    typeof (source as { metadata?: { continue?: string } }).metadata?.[
      CONTINUE_TOKEN_FIELD
    ] === "string"
  ) {
    return (source as { metadata: { continue: string } }).metadata[
      CONTINUE_TOKEN_FIELD
    ];
  }
  return;
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

const fetchAbiConfigMaps = async (
  context: KubernetesClient
): Promise<readonly V1ConfigMap[]> => {
  const abis: V1ConfigMap[] = [];
  let continueToken: string | undefined;

  do {
    const response = await context.client.listNamespacedConfigMap({
      namespace: context.namespace,
      limit: 100,
      _continue: continueToken,
    });
    const items = toConfigMapList(response);
    for (const item of items) {
      const annotation = item.metadata?.annotations?.[ARTIFACT_ANNOTATION_KEY];
      if (annotation === ARTIFACT_VALUES.abi) {
        abis.push(item);
      }
    }
    continueToken = getContinueToken(response);
  } while (continueToken);

  return abis;
};

const defaultDependencies: DownloadAbiDependencies = {
  createContext: createKubernetesClient,
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

  const configMaps = await fetchAbiConfigMaps(context);
  if (configMaps.length === 0) {
    process.stdout.write("[download-abi] No ABI ConfigMaps found.\n");
    return;
  }

  let totalFiles = 0;
  for (const configMap of configMaps) {
    totalFiles += await writeConfigMap(sanitizedDirectory, configMap);
  }

  process.stdout.write(
    `[download-abi] Synced ${configMaps.length} ConfigMaps with ${totalFiles} files.\n`
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
