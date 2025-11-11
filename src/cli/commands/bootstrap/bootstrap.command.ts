import { Command, InvalidArgumentError } from "commander";
import { ARTIFACT_DEFAULTS } from "../../../constants/artifact-defaults.ts";
import {
  ALGORITHM,
  type Algorithm,
  BesuGenesisService,
} from "../../../genesis/besu-genesis.service.ts";
import { NodeKeyFactory } from "../../../keys/node-key-factory.ts";
import { createCompileGenesisCommand } from "../compile-genesis/compile-genesis.command.ts";
import { createDownloadAbiCommand } from "../download-abi/download-abi.command.ts";
import { loadAbis } from "./bootstrap.abis.ts";
import { loadAllocations } from "./bootstrap.allocations.ts";
import {
  ALL_ARTIFACT_KINDS,
  parseArtifactList,
} from "./bootstrap.artifacts-filter.ts";
import {
  type HexAddress,
  promptForGenesisConfig,
} from "./bootstrap.genesis-prompts.ts";
import {
  outputResult as defaultOutputResult,
  type IndexedNode,
  type OutputPayload,
  type OutputType,
} from "./bootstrap.output.ts";
import {
  createCountParser,
  promptForCount,
  promptForText,
} from "./bootstrap.prompt-helpers.ts";
import { loadSubgraphHash } from "./bootstrap.subgraph.ts";

type CliOptions = {
  allocations?: string;
  abiDirectory?: string;
  acceptDefaults?: boolean;
  artifacts?: string;
  chainId?: number;
  consensus?: Algorithm;
  contractSizeLimit?: number;
  evmStackSize?: number;
  gasLimit?: string;
  gasPrice?: number;
  validators?: number;
  outputType?: OutputType;
  secondsPerBlock?: number;
  staticNodeDomain?: string;
  staticNodeNamespace?: string;
  staticNodePort?: number;
  staticNodeDiscoveryPort?: number;
  staticNodeServiceName?: string;
  staticNodePodPrefix?: string;
  genesisConfigmapName?: string;
  staticNodesConfigmapName?: string;
  faucetArtifactPrefix?: string;
  subgraphHashFile?: string;
};

type BootstrapDependencies = {
  factory: NodeKeyFactory;
  promptForCount: typeof promptForCount;
  promptForGenesis: typeof promptForGenesisConfig;
  promptForText: typeof promptForText;
  service: BesuGenesisService;
  loadAllocations: typeof loadAllocations;
  loadAbis: typeof loadAbis;
  loadSubgraphHash: typeof loadSubgraphHash;
  outputResult: (type: OutputType, payload: OutputPayload) => Promise<void>;
};

const DEFAULT_VALIDATOR_COUNT = 4;
const DEFAULT_STATIC_NODE_PORT = 30_303;
const {
  staticNodeServiceName: DEFAULT_STATIC_NODE_SERVICE_NAME,
  staticNodePodPrefix: DEFAULT_STATIC_NODE_POD_PREFIX,
  genesisConfigMapName: DEFAULT_GENESIS_CONFIGMAP_NAME,
  staticNodesConfigMapName: DEFAULT_STATIC_NODES_CONFIGMAP_NAME,
  faucetArtifactPrefix: DEFAULT_FAUCET_ARTIFACT_PREFIX,
  subgraphConfigMapName: DEFAULT_SUBGRAPH_CONFIGMAP_NAME,
} = ARTIFACT_DEFAULTS;
const OUTPUT_CHOICES: OutputType[] = ["screen", "file", "kubernetes"];
const LEADING_DOT_REGEX = /^\./u;
const UNCOMPRESSED_PUBLIC_KEY_PREFIX = "04";
const UNCOMPRESSED_PUBLIC_KEY_LENGTH = 130;

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

const normalizeStaticNodeDomain = (
  domain: string | undefined
): string | undefined => {
  if (!domain) {
    return;
  }

  const trimmed = domain.trim().replace(LEADING_DOT_REGEX, "");
  return trimmed.length === 0 ? undefined : trimmed;
};

const normalizeStaticNodeNamespace = (
  namespace: string | undefined
): string | undefined => {
  if (!namespace) {
    return;
  }

  const trimmed = namespace.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

type TextOptionKey =
  | "staticNodeDomain"
  | "staticNodeNamespace"
  | "staticNodeServiceName"
  | "staticNodePodPrefix"
  | "genesisConfigmapName"
  | "staticNodesConfigmapName"
  | "faucetArtifactPrefix";

type TextOptionDescriptor<T extends TextOptionKey> = {
  key: T;
  flag: string;
  description: string;
  parser?: (value: string) => CliOptions[T];
  sanitize?: (value: NonNullable<CliOptions[T]>) => CliOptions[T] | undefined;
};

const TEXT_OPTION_DESCRIPTORS: TextOptionDescriptor<TextOptionKey>[] = [
  {
    key: "staticNodeDomain",
    flag: "--static-node-domain <domain>",
    description:
      "DNS suffix appended to validator peer hostnames for static-nodes entries.",
    parser: stripSurroundingQuotes,
    sanitize: (value) => normalizeStaticNodeDomain(value) ?? undefined,
  },
  {
    key: "staticNodeNamespace",
    flag: "--static-node-namespace <name>",
    description:
      "Namespace segment inserted between service name and domain for static-nodes entries.",
    parser: stripSurroundingQuotes,
    sanitize: (value) => normalizeStaticNodeNamespace(value) ?? undefined,
  },
  {
    key: "staticNodeServiceName",
    flag: "--static-node-service-name <name>",
    description:
      "Headless Service name used when constructing static-nodes hostnames.",
    parser: stripSurroundingQuotes,
    sanitize: (value) => stripSurroundingQuotes(value),
  },
  {
    key: "staticNodePodPrefix",
    flag: "--static-node-pod-prefix <prefix>",
    description:
      "StatefulSet prefix used when constructing validator pod hostnames.",
    parser: stripSurroundingQuotes,
    sanitize: (value) => stripSurroundingQuotes(value),
  },
  {
    key: "genesisConfigmapName",
    flag: "--genesis-configmap-name <name>",
    description:
      "ConfigMap name that stores the generated genesis.json payload.",
    parser: stripSurroundingQuotes,
    sanitize: (value) => stripSurroundingQuotes(value),
  },
  {
    key: "staticNodesConfigmapName",
    flag: "--static-nodes-configmap-name <name>",
    description:
      "ConfigMap name that stores the generated static-nodes.json payload.",
    parser: stripSurroundingQuotes,
    sanitize: (value) => stripSurroundingQuotes(value),
  },
  {
    key: "faucetArtifactPrefix",
    flag: "--faucet-artifact-prefix <prefix>",
    description: "Prefix applied to faucet ConfigMaps and Secrets.",
    parser: stripSurroundingQuotes,
    sanitize: (value) => stripSurroundingQuotes(value),
  },
];

const deriveNodeId = (publicKey: string): string => {
  const trimmed = publicKey.startsWith("0x") ? publicKey.slice(2) : publicKey;
  if (
    trimmed.startsWith(UNCOMPRESSED_PUBLIC_KEY_PREFIX) &&
    trimmed.length === UNCOMPRESSED_PUBLIC_KEY_LENGTH
  ) {
    return trimmed.slice(2);
  }
  return trimmed;
};

const createStaticNodeEntries = (
  nodes: readonly IndexedNode[],
  {
    namespace,
    domain,
    serviceName,
    podPrefix,
    port,
    discoveryPort,
  }: {
    namespace?: string;
    domain?: string;
    serviceName: string;
    podPrefix: string;
    port: number;
    discoveryPort: number;
  }
): string[] => {
  const normalizedDomain = normalizeStaticNodeDomain(domain);
  const normalizedNamespace = normalizeStaticNodeNamespace(namespace);
  const hostServiceName =
    normalizeStaticNodeNamespace(serviceName) ?? serviceName;
  const podNamePrefix = normalizeStaticNodeNamespace(podPrefix) ?? podPrefix;

  return nodes.map((node) => {
    // StatefulSet pod ordinals start at 0 even though our generator indexes start at 1.
    const ordinal = node.index - 1;
    const podName = `${podNamePrefix}-${ordinal}`;
    const segments = [podName, hostServiceName];
    if (normalizedNamespace) {
      segments.push(normalizedNamespace);
    }
    if (normalizedDomain) {
      segments.push(normalizedDomain);
    }
    const host = segments.join(".");
    const nodeId = deriveNodeId(node.publicKey);

    return `enode://${nodeId}@${host}:${port}?discport=${discoveryPort}`;
  });
};

const runBootstrap = async (
  options: CliOptions,
  deps: BootstrapDependencies
): Promise<void> => {
  const {
    acceptDefaults = false,
    allocations,
    abiDirectory,
    artifacts: artifactsOption,
    chainId,
    consensus,
    contractSizeLimit,
    evmStackSize,
    gasLimit,
    gasPrice,
    outputType,
    secondsPerBlock,
    validators: validatorOption,
    staticNodeDomain: staticNodeDomainOption,
    staticNodeNamespace: staticNodeNamespaceOption,
    staticNodePort: staticNodePortOption,
    staticNodeDiscoveryPort: staticNodeDiscoveryPortOption,
    staticNodeServiceName: staticNodeServiceNameOption,
    staticNodePodPrefix: staticNodePodPrefixOption,
    genesisConfigmapName: genesisConfigmapNameOption,
    staticNodesConfigmapName: staticNodesConfigmapNameOption,
    faucetArtifactPrefix: faucetArtifactPrefixOption,
    subgraphHashFile: subgraphHashFileOption,
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

  const resolveText = async (
    label: string,
    provided: string | undefined,
    defaultValue: string
  ): Promise<string> => {
    if (provided && provided.trim().length > 0) {
      return provided.trim();
    }
    if (acceptDefaults) {
      return defaultValue;
    }
    const response = await deps.promptForText({
      defaultValue,
      labelText: label,
      message: label,
    });
    const trimmed = response.trim();
    return trimmed.length === 0 ? defaultValue : trimmed;
  };

  const validatorsCount = await resolveCount(
    "validator nodes",
    validatorOption,
    DEFAULT_VALIDATOR_COUNT
  );

  const staticNodeServiceName = await resolveText(
    "Static node service name",
    staticNodeServiceNameOption,
    DEFAULT_STATIC_NODE_SERVICE_NAME
  );

  const staticNodePodPrefix = await resolveText(
    "Static node pod prefix",
    staticNodePodPrefixOption,
    DEFAULT_STATIC_NODE_POD_PREFIX
  );

  const genesisConfigMapName = await resolveText(
    "Genesis ConfigMap name",
    genesisConfigmapNameOption,
    DEFAULT_GENESIS_CONFIGMAP_NAME
  );

  const staticNodesConfigMapName = await resolveText(
    "Static nodes ConfigMap name",
    staticNodesConfigmapNameOption,
    DEFAULT_STATIC_NODES_CONFIGMAP_NAME
  );

  const faucetArtifactPrefix = await resolveText(
    "Faucet artifact prefix",
    faucetArtifactPrefixOption,
    DEFAULT_FAUCET_ARTIFACT_PREFIX
  );

  const validators = generateGroup(deps.factory, validatorsCount);
  const faucet = deps.factory.generate();
  const staticNodes = createStaticNodeEntries(validators, {
    namespace: staticNodeNamespaceOption,
    domain: staticNodeDomainOption,
    serviceName: staticNodeServiceName,
    podPrefix: staticNodePodPrefix,
    port: staticNodePortOption ?? DEFAULT_STATIC_NODE_PORT,
    discoveryPort: staticNodeDiscoveryPortOption ?? DEFAULT_STATIC_NODE_PORT,
  });

  const validatorAddresses = validators.map<HexAddress>((node) => node.address);

  const faucetAddress: HexAddress = faucet.address;

  const trimmedAbiDirectory = abiDirectory?.trim();
  const allocationOverrides = allocations
    ? await deps.loadAllocations(allocations)
    : {};

  const abiArtifacts = trimmedAbiDirectory
    ? await deps.loadAbis(trimmedAbiDirectory)
    : [];

  const envSubgraphHashFile = Bun.env.SUBGRAPH_HASH_FILE?.trim();
  const providedSubgraphHashFile =
    subgraphHashFileOption === undefined
      ? undefined
      : subgraphHashFileOption.trim();
  let subgraphHashPath: string | undefined;
  if (providedSubgraphHashFile && providedSubgraphHashFile.length > 0) {
    subgraphHashPath = providedSubgraphHashFile;
  } else if (envSubgraphHashFile && envSubgraphHashFile.length > 0) {
    subgraphHashPath = envSubgraphHashFile;
  }

  const subgraphHash = subgraphHashPath
    ? await deps.loadSubgraphHash(subgraphHashPath)
    : undefined;

  const artifactFilter = parseArtifactList(artifactsOption ?? "");

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
    staticNodes,
    artifactNames: {
      faucetPrefix: faucetArtifactPrefix,
      validatorPrefix: staticNodePodPrefix,
      genesisConfigMapName,
      staticNodesConfigMapName,
      subgraphConfigMapName: DEFAULT_SUBGRAPH_CONFIGMAP_NAME,
    },
    abiArtifacts,
    subgraphHash,
    artifactFilter,
  };

  await deps.outputResult(outputType ?? "screen", payload);
};

/* c8 ignore start */
const defaultDependencies: BootstrapDependencies = {
  factory: new NodeKeyFactory(),
  promptForCount,
  promptForText,
  promptForGenesis: promptForGenesisConfig,
  service: new BesuGenesisService(),
  loadAllocations,
  loadAbis,
  loadSubgraphHash,
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

  const identityParser = <T>(value: T): T => value;
  for (const descriptor of TEXT_OPTION_DESCRIPTORS) {
    const parser = descriptor.parser ?? identityParser;
    generate.option(
      descriptor.flag,
      descriptor.description,
      parser as (value: string) => unknown
    );
  }

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
      "--abi-directory <path>",
      "Directory containing ABI JSON files to publish as ConfigMaps.",
      (value: string) => stripSurroundingQuotes(value)
    )
    .option(
      "--subgraph-hash-file <path>",
      "Path to a file containing the subgraph IPFS hash.",
      (value: string) => stripSurroundingQuotes(value)
    )
    .option(
      "--artifacts <list>",
      `Comma-separated list of artifacts to generate (${ALL_ARTIFACT_KINDS.join(", ")}). (default: all)`,
      (value: string) => stripSurroundingQuotes(value)
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
      "--static-node-port <number>",
      "P2P port used for static-nodes enode URIs.",
      (value: string) => parsePositiveInteger(value, "Static node port"),
      DEFAULT_STATIC_NODE_PORT
    )
    .option(
      "--static-node-discovery-port <number>",
      "Discovery port used for static-nodes enode URIs.",
      (value: string) =>
        parseNonNegativeInteger(value, "Static node discovery port"),
      DEFAULT_STATIC_NODE_PORT
    )
    .option(
      "--consensus <algorithm>",
      `Consensus algorithm (${Object.values(ALGORITHM).join(", ")}). (default: ${
        ALGORITHM.qbft
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
        staticNodePort:
          cmd.getOptionValueSource("staticNodePort") === "default"
            ? undefined
            : options.staticNodePort,
        staticNodeDiscoveryPort:
          cmd.getOptionValueSource("staticNodeDiscoveryPort") === "default"
            ? undefined
            : options.staticNodeDiscoveryPort,
      };

      for (const { key } of TEXT_OPTION_DESCRIPTORS) {
        if (cmd.getOptionValueSource(key) === "default") {
          normalizedOptions[key] = undefined;
        }
      }

      const sanitizedOptions: CliOptions = {
        ...normalizedOptions,
        allocations:
          normalizedOptions.allocations === undefined
            ? undefined
            : stripSurroundingQuotes(normalizedOptions.allocations),
        abiDirectory:
          normalizedOptions.abiDirectory === undefined
            ? undefined
            : stripSurroundingQuotes(normalizedOptions.abiDirectory),
        artifacts:
          normalizedOptions.artifacts === undefined
            ? undefined
            : stripSurroundingQuotes(normalizedOptions.artifacts),
        subgraphHashFile:
          normalizedOptions.subgraphHashFile === undefined
            ? undefined
            : stripSurroundingQuotes(normalizedOptions.subgraphHashFile),
      };

      for (const { key, sanitize } of TEXT_OPTION_DESCRIPTORS) {
        const currentValue = normalizedOptions[key];
        if (currentValue === undefined) {
          sanitizedOptions[key] = undefined;
          continue;
        }

        if (!sanitize) {
          sanitizedOptions[key] = currentValue;
          continue;
        }

        const sanitizedValue = sanitize(
          currentValue as NonNullable<CliOptions[typeof key]>
        );
        sanitizedOptions[key] = (sanitizedValue ??
          undefined) as CliOptions[typeof key];
      }

      if (sanitizedOptions.abiDirectory) {
        const trimmed = sanitizedOptions.abiDirectory.trim();
        sanitizedOptions.abiDirectory =
          trimmed.length === 0 ? undefined : trimmed;
      }

      if (sanitizedOptions.artifacts) {
        const trimmed = sanitizedOptions.artifacts.trim();
        if (trimmed.length > 0) {
          try {
            parseArtifactList(trimmed);
          } catch (error) {
            throw new InvalidArgumentError(
              error instanceof Error ? error.message : String(error)
            );
          }
        }
        sanitizedOptions.artifacts = trimmed.length === 0 ? undefined : trimmed;
      }

      if (sanitizedOptions.subgraphHashFile) {
        const trimmed = sanitizedOptions.subgraphHashFile.trim();
        sanitizedOptions.subgraphHashFile =
          trimmed.length === 0 ? undefined : trimmed;
      }

      await runBootstrap(sanitizedOptions, deps);
    });

  // Register subcommands from their own modules to keep the bootstrap surface composable.
  command.addCommand(createCompileGenesisCommand());
  command.addCommand(createDownloadAbiCommand());

  return command;
};

export type { BootstrapDependencies, CliOptions };
export { createCliCommand, runBootstrap };
