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
  acceptDefaults?: boolean;
  chainId?: number;
  consensus?: Algorithm;
  contractSizeLimit?: number;
  evmStackSize?: number;
  gasLimit?: string;
  gasPrice?: number;
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
const OUTPUT_CHOICES: OutputType[] = ["screen", "file", "kubernetes"];

// Normalizes CLI inputs wrapped by orchestrators that keep literal quotes.
const stripSurroundingQuotes = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length < 2) {
    return trimmed;
  }
  const startsWithQuote = trimmed[0];
  const endsWithQuote = trimmed.at(-1);
  if (
    (startsWithQuote === '"' || startsWithQuote === "'") &&
    startsWithQuote === endsWithQuote
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

const parsePositiveInteger = (value: string, label: string): number => {
  const parsed = Number.parseInt(stripSurroundingQuotes(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError(`${label} must be a positive integer.`);
  }
  return parsed;
};

const parseNonNegativeInteger = (value: string, label: string): number => {
  const parsed = Number.parseInt(stripSurroundingQuotes(value), 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new InvalidArgumentError(`${label} must be a non-negative integer.`);
  }
  return parsed;
};

const parsePositiveBigInt = (value: string, label: string): string => {
  const trimmed = stripSurroundingQuotes(value);
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
  const {
    acceptDefaults = false,
    allocations,
    chainId,
    consensus,
    contractSizeLimit,
    evmStackSize,
    gasLimit,
    gasPrice,
    outputType,
    secondsPerBlock,
    validators: validatorOption,
  } = options;

  const resolveCount = (
    label: string,
    provided: number | undefined,
    defaultValue: number
  ): Promise<number> => {
    if (provided !== undefined) {
      return Promise.resolve(provided);
    }
    if (acceptDefaults) {
      return Promise.resolve(defaultValue);
    }
    return deps.promptForCount(label, undefined, defaultValue);
  };

  const validatorsCount = await resolveCount(
    "validator nodes",
    validatorOption,
    DEFAULT_VALIDATOR_COUNT
  );

  const validators = generateGroup(deps.factory, validatorsCount);
  const faucet = deps.factory.generate();

  const validatorAddresses = validators.map<HexAddress>((node) => node.address);

  const faucetAddress: HexAddress = faucet.address;

  const allocationOverrides = allocations
    ? await deps.loadAllocations(allocations)
    : {};

  const { genesis } = await deps.promptForGenesis(deps.service, {
    faucetAddress,
    allocations: allocationOverrides,
    preset: {
      algorithm: consensus,
      chainId,
      secondsPerBlock,
      gasLimit,
      gasPrice,
      evmStackSize,
      contractSizeLimit,
    },
    autoAcceptDefaults: acceptDefaults,
    validatorAddresses,
  });

  const payload: OutputPayload = {
    faucet,
    genesis,
    validators,
  };

  await deps.outputResult(outputType ?? "screen", payload);
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
    .description("Utilities for configuring Besu-based networks.");

  // Keep the root command free of options so future subcommands can compose alongside generate.
  const generate = command
    .command("generate")
    .description(
      "Generate node identities, configure consensus, and emit a Besu genesis."
    );

  generate
    .option(
      "-v, --validators <count>",
      "Number of validator nodes to generate.",
      createCountParser("Validators"),
      DEFAULT_VALIDATOR_COUNT
    )
    .option(
      "-a, --allocations <file>",
      "Path to a genesis allocations JSON file. (default: none)"
    )
    .option(
      "-o, --outputType <type>",
      `Output target (${OUTPUT_CHOICES.join(", ")}).`,
      (value: string): OutputType => {
        const normalized = stripSurroundingQuotes(value).toLowerCase();
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
      `Consensus algorithm (${Object.values(ALGORITHM).join(", ")}). (default: ${
        ALGORITHM.QBFT
      })`,
      (value: string): Algorithm => {
        const normalized = stripSurroundingQuotes(value).toLowerCase();
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
      "Chain ID for the genesis config. (default: random between 40000 and 50000)",
      (value: string): number => parsePositiveInteger(value, "Chain ID")
    )
    .option(
      "--seconds-per-block <number>",
      "Block time in seconds. (default: 2)",
      (value: string): number =>
        parsePositiveInteger(value, "Seconds per block")
    )
    .option(
      "--gas-limit <decimal>",
      "Block gas limit in decimal form. (default: 9007199254740991)",
      (value: string): string => parsePositiveBigInt(value, "Gas limit")
    )
    .option(
      "--gas-price <number>",
      "Base gas price (wei). (default: 0)",
      (value: string): number => parseNonNegativeInteger(value, "Gas price")
    )
    .option(
      "--evm-stack-size <number>",
      "EVM stack size limit. (default: 2048)",
      (value: string): number => parsePositiveInteger(value, "EVM stack size")
    )
    .option(
      "--contract-size-limit <number>",
      "Contract size limit in bytes. (default: 2147483647)",
      (value: string): number =>
        parsePositiveInteger(value, "Contract size limit")
    )
    .option(
      "--accept-defaults",
      "Accept default values for all prompts when CLI flags are omitted. (default: disabled)"
    )
    .action(async (options: CliOptions, cmd: Command) => {
      const normalizedOptions: CliOptions = {
        ...options,
        validators:
          cmd.getOptionValueSource("validators") === "default"
            ? undefined
            : options.validators,
      };

      const sanitizedOptions: CliOptions = {
        ...normalizedOptions,
        allocations:
          normalizedOptions.allocations === undefined
            ? undefined
            : stripSurroundingQuotes(normalizedOptions.allocations),
      };

      await runBootstrap(sanitizedOptions, deps);
    });

  return command;
};

export type { BootstrapDependencies, CliOptions };
export { createCliCommand, runBootstrap };
