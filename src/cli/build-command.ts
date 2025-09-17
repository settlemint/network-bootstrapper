import { Command, InvalidArgumentError } from "commander";

import {
  ALGORITHM,
  type Algorithm,
  BesuGenesisService,
} from "../genesis/besu-genesis.service.ts";
import { NodeKeyFactory } from "../keys/node-key-factory.ts";
import { loadAllocations } from "./allocations.ts";
import { type HexAddress, promptForGenesisConfig } from "./genesis-prompts.ts";
import {
  outputResult as defaultOutputResult,
  type IndexedNode,
  type OutputPayload,
  type OutputType,
} from "./output.ts";
import { createCountParser, promptForCount } from "./prompt-helpers.ts";

type CliOptions = {
  allocations?: string;
  chainId?: number;
  consensus?: Algorithm;
  contractSizeLimit?: number;
  evmStackSize?: number;
  gasLimit?: string;
  gasPrice?: number;
  rpcNodes?: number;
  validators?: number;
  outputType?: OutputType;
  secondsPerBlock?: number;
};

type BootstrapDependencies = {
  factory: NodeKeyFactory;
  promptForCount: typeof promptForCount;
  promptForGenesis: typeof promptForGenesisConfig;
  service: BesuGenesisService;
  loadAllocations: typeof loadAllocations;
  outputResult: (type: OutputType, payload: OutputPayload) => Promise<void>;
};

const DEFAULT_VALIDATOR_COUNT = 4;
const DEFAULT_RPC_COUNT = 2;
const OUTPUT_CHOICES: OutputType[] = ["screen", "file", "kubernetes"];

const parsePositiveInteger = (value: string, label: string): number => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError(`${label} must be a positive integer.`);
  }
  return parsed;
};

const parseNonNegativeInteger = (value: string, label: string): number => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new InvalidArgumentError(`${label} must be a non-negative integer.`);
  }
  return parsed;
};

const parsePositiveBigInt = (value: string, label: string): string => {
  const trimmed = value.trim();
  try {
    const parsed = BigInt(trimmed);
    if (parsed <= 0n) {
      throw new InvalidArgumentError(`${label} must be a positive integer.`);
    }
  } catch (_error) {
    throw new InvalidArgumentError(`${label} must be a positive integer.`);
  }
  return trimmed;
};

const generateGroup = (factory: NodeKeyFactory, count: number): IndexedNode[] =>
  Array.from({ length: count }, (_, index) => ({
    index: index + 1,
    ...factory.generate(),
  }));

const runBootstrap = async (
  options: CliOptions,
  deps: BootstrapDependencies
): Promise<void> => {
  const validatorsCount = await deps.promptForCount(
    "validator nodes",
    options.validators,
    DEFAULT_VALIDATOR_COUNT
  );
  const rpcNodeCount = await deps.promptForCount(
    "RPC nodes",
    options.rpcNodes,
    DEFAULT_RPC_COUNT
  );

  const validators = generateGroup(deps.factory, validatorsCount);
  const rpcNodes = generateGroup(deps.factory, rpcNodeCount);
  const faucet = deps.factory.generate();

  const validatorAddresses = validators.map<HexAddress>((node) => node.address);

  const faucetAddress: HexAddress = faucet.address;

  const allocationOverrides = options.allocations
    ? await deps.loadAllocations(options.allocations)
    : {};

  const { genesis } = await deps.promptForGenesis(deps.service, {
    faucetAddress,
    allocations: allocationOverrides,
    preset: {
      algorithm: options.consensus,
      chainId: options.chainId,
      secondsPerBlock: options.secondsPerBlock,
      gasLimit: options.gasLimit,
      gasPrice: options.gasPrice,
      evmStackSize: options.evmStackSize,
      contractSizeLimit: options.contractSizeLimit,
    },
    validatorAddresses,
  });

  const outputType = options.outputType ?? "screen";
  const payload: OutputPayload = {
    faucet,
    genesis,
    rpcNodes,
    validators,
  };

  await deps.outputResult(outputType, payload);
};

/* c8 ignore start */
const defaultDependencies: BootstrapDependencies = {
  factory: new NodeKeyFactory(),
  promptForCount,
  promptForGenesis: promptForGenesisConfig,
  service: new BesuGenesisService(),
  loadAllocations,
  outputResult: defaultOutputResult,
};
/* c8 ignore end */

const createCliCommand = (
  deps: BootstrapDependencies = defaultDependencies
): Command => {
  const command = new Command();

  command
    .name("network-bootstrapper")
    .description(
      "Generate node identities, configure consensus, and emit a Besu genesis."
    )
    .option(
      "-v, --validators <count>",
      "Number of validator nodes to generate.",
      createCountParser("Validators")
    )
    .option(
      "-r, --rpc-nodes <count>",
      "Number of RPC nodes to generate.",
      createCountParser("RPC nodes")
    )
    .option(
      "-a, --allocations <file>",
      "Path to a genesis allocations JSON file."
    )
    .option(
      "-o, --outputType <type>",
      `Output target (${OUTPUT_CHOICES.join(", ")}).`,
      (value: string): OutputType => {
        const normalized = value.toLowerCase();
        if (OUTPUT_CHOICES.includes(normalized as OutputType)) {
          return normalized as OutputType;
        }
        throw new InvalidArgumentError(
          `Output type must be one of: ${OUTPUT_CHOICES.join(", ")}.`
        );
      },
      "screen"
    )
    .option(
      "--consensus <algorithm>",
      `Consensus algorithm (${Object.values(ALGORITHM).join(", ")}).`,
      (value: string): Algorithm => {
        const normalized = value.trim().toLowerCase();
        const match = Object.values(ALGORITHM).find(
          (candidate) => candidate.toLowerCase() === normalized
        );
        if (!match) {
          throw new InvalidArgumentError(
            `Consensus must be one of: ${Object.values(ALGORITHM).join(", ")}.`
          );
        }
        return match;
      }
    )
    .option(
      "--chain-id <number>",
      "Chain ID for the genesis config.",
      (value: string): number => parsePositiveInteger(value, "Chain ID")
    )
    .option(
      "--seconds-per-block <number>",
      "Block time in seconds.",
      (value: string): number =>
        parsePositiveInteger(value, "Seconds per block")
    )
    .option(
      "--gas-limit <decimal>",
      "Block gas limit in decimal form.",
      (value: string): string => parsePositiveBigInt(value, "Gas limit")
    )
    .option(
      "--gas-price <number>",
      "Base gas price (wei).",
      (value: string): number => parseNonNegativeInteger(value, "Gas price")
    )
    .option(
      "--evm-stack-size <number>",
      "EVM stack size limit.",
      (value: string): number => parsePositiveInteger(value, "EVM stack size")
    )
    .option(
      "--contract-size-limit <number>",
      "Contract size limit in bytes.",
      (value: string): number =>
        parsePositiveInteger(value, "Contract size limit")
    );

  command.action(async (options: CliOptions) => {
    await runBootstrap(options, deps);
  });

  return command;
};

export type { BootstrapDependencies, CliOptions };
export { createCliCommand, runBootstrap };
