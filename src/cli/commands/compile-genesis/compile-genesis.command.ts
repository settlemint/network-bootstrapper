import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { Command } from "commander";

import { ARTIFACT_DEFAULTS } from "../../../constants/artifact-defaults.ts";
import type {
  BesuAllocAccount,
  BesuGenesis,
} from "../../../genesis/besu-genesis.service.ts";
import {
  createKubernetesClient,
  readConfigMap,
  toAllocationConfigMapName,
} from "../../integrations/kubernetes/kubernetes.client.ts";

const GENESIS_DATA_KEY = "genesis.json";
const ALLOCATION_DATA_KEY = "alloc.json";
const DEFAULT_OUTPUT_PATH = "/data/atk-genesis.json";

type CompileGenesisOptions = {
  genesisConfigMapName: string;
  outputPath: string;
};

type CommanderOptions = {
  genesisConfigmapName?: string;
  outputPath?: string;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isBesuAllocAccount = (value: unknown): value is BesuAllocAccount => {
  if (!isPlainObject(value)) {
    return false;
  }

  if (typeof value.balance !== "string") {
    return false;
  }

  if (value.code !== undefined && typeof value.code !== "string") {
    return false;
  }

  if (value.storage !== undefined) {
    if (!isPlainObject(value.storage)) {
      return false;
    }
    return Object.values(value.storage).every(
      (entry) => typeof entry === "string"
    );
  }

  return true;
};

const parseGenesisPayload = (raw: string): BesuGenesis => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Genesis ConfigMap payload is not valid JSON: ${(error as Error).message}`
    );
  }

  if (!isPlainObject(parsed)) {
    throw new Error("Genesis ConfigMap payload must be an object.");
  }

  if (!("alloc" in parsed)) {
    throw new Error("Genesis payload does not contain an alloc section.");
  }

  const allocCandidate = (parsed as { alloc?: unknown }).alloc;
  if (!isPlainObject(allocCandidate)) {
    throw new Error("Genesis alloc must be an object.");
  }

  const normalizedAlloc: Record<string, BesuAllocAccount> = {};
  for (const [address, account] of Object.entries(allocCandidate)) {
    if (!isBesuAllocAccount(account)) {
      throw new Error(`Genesis allocation for ${address} is invalid.`);
    }
    normalizedAlloc[address] = account;
  }

  return {
    ...(parsed as Record<string, unknown>),
    alloc: normalizedAlloc,
  } as BesuGenesis;
};

const parseAllocationEntry = (
  raw: string,
  sourceName: string
): BesuAllocAccount => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `ConfigMap ${sourceName} contains invalid JSON: ${(error as Error).message}`
    );
  }

  if (!isBesuAllocAccount(parsed)) {
    throw new Error(
      `ConfigMap ${sourceName} does not contain a valid allocation.`
    );
  }

  return parsed;
};

const compileGenesis = async ({
  genesisConfigMapName,
  outputPath,
}: CompileGenesisOptions): Promise<void> => {
  const context = await createKubernetesClient();
  const { namespace } = context;

  const genesisConfig = await readConfigMap(context, genesisConfigMapName);
  if (!genesisConfig) {
    throw new Error(
      `ConfigMap ${genesisConfigMapName} not found in namespace ${namespace}.`
    );
  }

  const genesisPayload = genesisConfig?.data?.[GENESIS_DATA_KEY];
  if (!genesisPayload) {
    throw new Error(
      `ConfigMap ${genesisConfigMapName} does not contain ${GENESIS_DATA_KEY}.`
    );
  }

  const genesis = parseGenesisPayload(genesisPayload);
  const combinedAlloc: Record<string, BesuAllocAccount> = {
    ...genesis.alloc,
  };

  for (const address of Object.keys(combinedAlloc)) {
    const allocationConfigMapName = toAllocationConfigMapName(address);
    const allocationConfig = await readConfigMap(
      context,
      allocationConfigMapName
    );
    if (!allocationConfig) {
      process.stdout.write(
        `ConfigMap ${allocationConfigMapName} not found; keeping placeholder for ${address}.\n`
      );
      continue;
    }

    const allocationPayload = allocationConfig?.data?.[ALLOCATION_DATA_KEY];
    if (!allocationPayload) {
      process.stdout.write(
        `ConfigMap ${allocationConfigMapName} missing ${ALLOCATION_DATA_KEY}; keeping placeholder for ${address}.\n`
      );
      continue;
    }

    const account = parseAllocationEntry(
      allocationPayload,
      allocationConfigMapName
    );
    combinedAlloc[address] = account;
    process.stdout.write(
      `Merged allocation for ${address} from ${allocationConfigMapName}.\n`
    );
  }

  const combinedGenesis: BesuGenesis = {
    ...genesis,
    alloc: combinedAlloc,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await Bun.write(outputPath, `${JSON.stringify(combinedGenesis, null, 2)}\n`);
  process.stdout.write(`Wrote compiled genesis to ${outputPath}.\n`);
};

const createCompileGenesisCommand = (): Command => {
  const command = new Command("compile-genesis")
    .description(
      "Merge per-account allocation ConfigMaps into a Besu genesis file."
    )
    .option(
      "--genesis-configmap-name <name>",
      "Name of the ConfigMap containing the base genesis JSON.",
      ARTIFACT_DEFAULTS.genesisConfigMapName
    )
    .option(
      "--output-path <path>",
      "Filesystem path for the compiled genesis output.",
      DEFAULT_OUTPUT_PATH
    )
    .action(async (rawOptions: CommanderOptions) => {
      const options: CompileGenesisOptions = {
        genesisConfigMapName:
          rawOptions.genesisConfigmapName ??
          ARTIFACT_DEFAULTS.genesisConfigMapName,
        outputPath: rawOptions.outputPath ?? DEFAULT_OUTPUT_PATH,
      };

      await compileGenesis(options);
    });

  return command;
};

export type { CompileGenesisOptions };
export { compileGenesis, createCompileGenesisCommand };
