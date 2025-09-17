import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { getAddress } from "viem";
import { ARTIFACT_DEFAULTS } from "../constants/artifact-defaults.ts";
import type { BesuAllocAccount } from "../genesis/besu-genesis.service.ts";
import { ALGORITHM } from "../genesis/besu-genesis.service.ts";
import type { GeneratedNodeKey } from "../keys/node-key-factory.ts";
import type { BootstrapDependencies, CliOptions } from "./build-command.ts";
import { createCliCommand, runBootstrap } from "./build-command.ts";
import type { OutputPayload, OutputType } from "./output.ts";
import { outputResult as realOutputResult } from "./output.ts";

const VALIDATOR_LABEL = "validator nodes";
const VALIDATOR_RETURN = 2;
const GENESIS_MARKER = '"extraData": "0xextra"';
const EXPECTED_DEFAULT_VALIDATOR = 4;
const DEFAULT_STATIC_NODE_PORT = 30_303;
const CUSTOM_STATIC_NODE_PORT = 40_000;
const LEADING_DOT_REGEX = /^\./u;
const {
  staticNodeServiceName: DEFAULT_SERVICE_NAME,
  staticNodePodPrefix: DEFAULT_POD_PREFIX,
  genesisConfigMapName: DEFAULT_GENESIS_CONFIGMAP_NAME,
  staticNodesConfigMapName: DEFAULT_STATIC_NODES_CONFIGMAP_NAME,
  faucetArtifactPrefix: DEFAULT_FAUCET_PREFIX,
} = ARTIFACT_DEFAULTS;
const UNCOMPRESSED_PUBLIC_KEY_PREFIX = "04";
const UNCOMPRESSED_PUBLIC_KEY_LENGTH = 130;
const HEX_RADIX = 16;
const PAD_WIDTH = 2;
const PAD_CHAR = "0";
const ADDRESS_REPEAT = 20;
const PRIVATE_KEY_REPEAT = 32;
const PUBLIC_KEY_REPEAT = 64;
const FIRST_VALIDATOR_INDEX = 1;
const SECOND_VALIDATOR_INDEX = 2;
const FAUCET_INDEX = VALIDATOR_RETURN + 1;
const createFactoryStub = () => {
  let counter = 0;
  return {
    generate: (): GeneratedNodeKey => {
      counter += 1;
      const pattern = counter.toString(HEX_RADIX).padStart(PAD_WIDTH, PAD_CHAR);
      const addressHex = getAddress(`0x${pattern.repeat(ADDRESS_REPEAT)}`);
      const privateKey = `0x${pattern.repeat(PRIVATE_KEY_REPEAT)}` as const;
      const publicKey = `0x04${pattern.repeat(PUBLIC_KEY_REPEAT)}` as const;
      return {
        address: addressHex,
        publicKey,
        privateKey,
        enode: privateKey,
      };
    },
  };
};

const passthroughTextPrompt: BootstrapDependencies["promptForText"] = ({
  defaultValue,
}) => Promise.resolve(defaultValue);

const expectedAddress = (index: number) => {
  const pattern = index.toString(HEX_RADIX).padStart(PAD_WIDTH, PAD_CHAR);
  return getAddress(`0x${pattern.repeat(ADDRESS_REPEAT)}`);
};

const expectedPublicKey = (index: number) => {
  const pattern = index.toString(HEX_RADIX).padStart(PAD_WIDTH, PAD_CHAR);
  return `0x04${pattern.repeat(PUBLIC_KEY_REPEAT)}` as const;
};

const expectedStaticNodeUri = (
  index: number,
  domain?: string,
  port: number = DEFAULT_STATIC_NODE_PORT,
  discoveryPort: number = DEFAULT_STATIC_NODE_PORT,
  namespace?: string,
  serviceName: string = DEFAULT_SERVICE_NAME,
  podPrefix: string = DEFAULT_POD_PREFIX
): string => {
  const normalizedDomain =
    domain === undefined || domain.trim().length === 0
      ? undefined
      : domain.trim().replace(LEADING_DOT_REGEX, "");
  const normalizedNamespace =
    namespace === undefined || namespace.trim().length === 0
      ? undefined
      : namespace.trim();
  const ordinal = index - 1;
  const podName = `${podPrefix}-${ordinal}`;
  const segments = [podName, serviceName];
  if (normalizedNamespace) {
    segments.push(normalizedNamespace);
  }
  if (normalizedDomain) {
    segments.push(normalizedDomain);
  }
  const host = segments.join(".");
  const publicKey = expectedPublicKey(index).slice(2);
  const nodeId =
    publicKey.startsWith(UNCOMPRESSED_PUBLIC_KEY_PREFIX) &&
    publicKey.length === UNCOMPRESSED_PUBLIC_KEY_LENGTH
      ? publicKey.slice(2)
      : publicKey;
  return `enode://${nodeId}@${host}:${port}?discport=${discoveryPort}`;
};

const captureStdout = () => {
  let captured = "";
  const original = process.stdout.write;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    captured += chunk.toString();
    return true;
  }) as typeof process.stdout.write;

  return {
    read: () => captured,
    restore: () => {
      process.stdout.write = original;
    },
  };
};

describe("CLI command bootstrap", () => {
  let stdout: ReturnType<typeof captureStdout>;

  beforeEach(() => {
    stdout = captureStdout();
  });

  afterEach(() => {
    stdout.restore();
  });

  test("runBootstrap orchestrates prompts and writes genesis", async () => {
    const factory = createFactoryStub();
    const promptCalls: [string, number | undefined, number][] = [];
    const textPromptCalls: [string, string][] = [];
    let loadAllocationsPath: string | undefined;
    let outputInvocation:
      | {
          type: OutputType;
          payload: OutputPayload;
        }
      | undefined;

    const deps: BootstrapDependencies = {
      factory,
      promptForCount: (label, provided, defaultValue) => {
        promptCalls.push([label, provided, defaultValue]);
        return Promise.resolve(VALIDATOR_RETURN);
      },
      promptForGenesis: (
        _service,
        {
          allocations,
          validatorAddresses,
          faucetAddress,
          preset,
          autoAcceptDefaults,
        }
      ) => {
        expect(validatorAddresses).toEqual([
          expectedAddress(FIRST_VALIDATOR_INDEX),
          expectedAddress(SECOND_VALIDATOR_INDEX),
        ]);
        expect(faucetAddress).toBe(expectedAddress(FAUCET_INDEX));
        expect(allocations).toEqual({
          [expectedAddress(FAUCET_INDEX)]: { balance: "0x01" },
        });
        expect(autoAcceptDefaults).toBe(false);
        expect(preset).toEqual({
          algorithm: undefined,
          chainId: undefined,
          secondsPerBlock: undefined,
          gasLimit: undefined,
          gasPrice: undefined,
          evmStackSize: undefined,
          contractSizeLimit: undefined,
        });
        return Promise.resolve({
          algorithm: ALGORITHM.QBFT,
          config: {
            chainId: 99,
            faucetWalletAddress: faucetAddress,
            gasLimit: "0x2",
            secondsPerBlock: 4,
          },
          genesis: { config: {}, extraData: "0xextra" } as any,
        });
      },
      promptForText: ({ labelText, defaultValue }) => {
        textPromptCalls.push([labelText, defaultValue]);
        return Promise.resolve(defaultValue);
      },
      service: {} as any,
      loadAllocations: (path: string) => {
        loadAllocationsPath = path;
        return Promise.resolve({
          [expectedAddress(FAUCET_INDEX)]: { balance: "0x01" as const },
        } satisfies Record<string, BesuAllocAccount>);
      },
      outputResult: async (type, payload) => {
        outputInvocation = { type, payload };
        await realOutputResult(type, payload);
      },
    };

    const options: CliOptions = { allocations: "/tmp/alloc.json" };

    await runBootstrap(options, deps);

    expect(promptCalls).toEqual([
      [VALIDATOR_LABEL, undefined, EXPECTED_DEFAULT_VALIDATOR],
    ]);
    expect(textPromptCalls).toEqual([
      ["Static node service name", DEFAULT_SERVICE_NAME],
      ["Static node pod prefix", DEFAULT_POD_PREFIX],
      ["Genesis ConfigMap name", DEFAULT_GENESIS_CONFIGMAP_NAME],
      ["Static nodes ConfigMap name", DEFAULT_STATIC_NODES_CONFIGMAP_NAME],
      ["Faucet artifact prefix", DEFAULT_FAUCET_PREFIX],
    ]);
    const output = stdout.read();
    expect(output).toContain("Genesis");
    expect(output).toContain("Validator Nodes");
    expect(output).toContain("Static Nodes");
    expect(output).toContain(GENESIS_MARKER);
    expect(loadAllocationsPath).toBe("/tmp/alloc.json");
    expect(outputInvocation?.type).toBe("screen");
    expect(outputInvocation?.payload.staticNodes).toEqual([
      expectedStaticNodeUri(FIRST_VALIDATOR_INDEX),
      expectedStaticNodeUri(SECOND_VALIDATOR_INDEX),
    ]);
    expect(outputInvocation?.payload.artifactNames).toEqual({
      faucetPrefix: DEFAULT_FAUCET_PREFIX,
      validatorPrefix: DEFAULT_POD_PREFIX,
      genesisConfigMapName: DEFAULT_GENESIS_CONFIGMAP_NAME,
      staticNodesConfigMapName: DEFAULT_STATIC_NODES_CONFIGMAP_NAME,
    });
  });

  test("createCliCommand wires metadata", () => {
    const command = createCliCommand();
    expect(command.name()).toBe("network-bootstrapper");
  });

  test("createCliCommand action runs with provided options", async () => {
    const factory = createFactoryStub();
    const promptCalls: [string, number | undefined, number][] = [];
    const deps: BootstrapDependencies = {
      factory,
      promptForCount: (label, provided, defaultValue) => {
        promptCalls.push([label, provided, defaultValue]);
        return Promise.resolve(provided ?? VALIDATOR_RETURN);
      },
      promptForGenesis: (_service, { preset }) => {
        expect(preset).toEqual({
          algorithm: ALGORITHM.QBFT,
          chainId: 55,
          secondsPerBlock: 3,
          gasLimit: "5000000",
          gasPrice: 1,
          evmStackSize: 2048,
          contractSizeLimit: 10_000,
        });
        return Promise.resolve({
          algorithm: preset?.algorithm ?? ALGORITHM.QBFT,
          config: {
            chainId: preset?.chainId ?? 1,
            faucetWalletAddress: expectedAddress(VALIDATOR_RETURN + 1),
            gasLimit: "0x1",
            secondsPerBlock: preset?.secondsPerBlock ?? 1,
            gasPrice: preset?.gasPrice ?? 0,
          },
          genesis: { config: {}, extraData: "0xextra" } as any,
        });
      },
      promptForText: passthroughTextPrompt,
      service: {} as any,
      loadAllocations: () =>
        Promise.resolve({} satisfies Record<string, BesuAllocAccount>),
      outputResult: async (type, payload) => {
        await realOutputResult(type, payload);
      },
    };

    const command = createCliCommand(deps);
    await command.parseAsync(
      [
        "node",
        "cli",
        "generate",
        "--validators",
        "2",
        "--allocations",
        "/tmp/mock.json",
        "--consensus",
        "qbft",
        "--chain-id",
        "55",
        "--seconds-per-block",
        "3",
        "--gas-limit",
        "5000000",
        "--gas-price",
        "1",
        "--evm-stack-size",
        "2048",
        "--contract-size-limit",
        "10000",
        "--static-node-domain",
        "network.svc.cluster.local",
        "--static-node-port",
        `${CUSTOM_STATIC_NODE_PORT}`,
        "--static-node-discovery-port",
        "0",
      ],
      { from: "node" }
    );

    expect(promptCalls).toEqual([]);
    expect(stdout.read()).toContain("Genesis");
    expect(stdout.read()).toContain(GENESIS_MARKER);
  });

  test("createCliCommand accepts static node configuration flags", async () => {
    const factory = createFactoryStub();
    let capturedPayload: OutputPayload | undefined;

    const deps: BootstrapDependencies = {
      factory,
      promptForCount: (_label, provided, defaultValue) =>
        Promise.resolve(provided ?? defaultValue),
      promptForGenesis: (_service, { faucetAddress }) =>
        Promise.resolve({
          algorithm: ALGORITHM.QBFT,
          config: {
            chainId: 77,
            faucetWalletAddress: faucetAddress,
            gasLimit: "0x1",
            secondsPerBlock: 2,
          },
          genesis: { config: {}, extraData: "0xextra" } as any,
        }),
      promptForText: passthroughTextPrompt,
      service: {} as any,
      loadAllocations: () =>
        Promise.resolve({} satisfies Record<string, BesuAllocAccount>),
      outputResult: (_type, payload) => {
        capturedPayload = payload;
        return Promise.resolve();
      },
    };

    const command = createCliCommand(deps);
    await command.parseAsync(
      [
        "node",
        "cli",
        "generate",
        "--validators",
        "1",
        "--static-node-domain",
        "svc.cluster.local",
        "--static-node-namespace",
        "network",
        "--static-node-port",
        "40000",
        "--static-node-discovery-port",
        "0",
        "--static-node-service-name",
        "custom-service",
        "--static-node-pod-prefix",
        "custom-validator",
        "--genesis-configmap-name",
        "custom-genesis",
        "--static-nodes-configmap-name",
        "custom-static-nodes",
        "--faucet-artifact-prefix",
        "custom-faucet",
      ],
      { from: "node" }
    );

    expect(capturedPayload?.staticNodes).toEqual([
      expectedStaticNodeUri(
        1,
        "svc.cluster.local",
        CUSTOM_STATIC_NODE_PORT,
        0,
        "network",
        "custom-service",
        "custom-validator"
      ),
    ]);
    expect(capturedPayload?.artifactNames).toEqual({
      faucetPrefix: "custom-faucet",
      validatorPrefix: "custom-validator",
      genesisConfigMapName: "custom-genesis",
      staticNodesConfigMapName: "custom-static-nodes",
    });
  });

  test("runBootstrap builds static nodes with domain and custom ports", async () => {
    const factory = createFactoryStub();
    let capturedPayload: OutputPayload | undefined;

    const deps: BootstrapDependencies = {
      factory,
      promptForCount: (_label, provided, defaultValue) =>
        Promise.resolve(provided ?? defaultValue),
      promptForGenesis: (_service, { validatorAddresses, faucetAddress }) => {
        expect(validatorAddresses).toHaveLength(1);
        expect(faucetAddress).toBe(expectedAddress(2));
        return Promise.resolve({
          algorithm: ALGORITHM.QBFT,
          config: {
            chainId: 123,
            faucetWalletAddress: faucetAddress,
            gasLimit: "0x1",
            secondsPerBlock: 2,
          },
          genesis: { config: {}, extraData: "0xextra" } as any,
        });
      },
      promptForText: passthroughTextPrompt,
      service: {} as any,
      loadAllocations: () =>
        Promise.resolve({} satisfies Record<string, BesuAllocAccount>),
      outputResult: (_type, payload) => {
        capturedPayload = payload;
        return Promise.resolve();
      },
    };

    await runBootstrap(
      {
        validators: 1,
        staticNodeDomain: "svc.cluster.local",
        staticNodeNamespace: "network",
        staticNodePort: CUSTOM_STATIC_NODE_PORT,
        staticNodeDiscoveryPort: 0,
      },
      deps
    );

    expect(capturedPayload?.staticNodes).toEqual([
      expectedStaticNodeUri(
        1,
        "svc.cluster.local",
        CUSTOM_STATIC_NODE_PORT,
        0,
        "network"
      ),
    ]);
  });

  test("runBootstrap bypasses genesis prompts when CLI overrides provided", async () => {
    const factory = createFactoryStub();
    const validatorOverride = 1;

    const deps: BootstrapDependencies = {
      factory,
      promptForCount: (_label, provided) => {
        if (provided === undefined) {
          throw new Error(
            "promptForCount should not prompt when values are provided"
          );
        }
        return Promise.resolve(provided);
      },
      promptForGenesis: (_service, { preset, autoAcceptDefaults }) => {
        expect(autoAcceptDefaults).toBe(false);
        expect(preset).toEqual({
          algorithm: ALGORITHM.IBFTv2,
          chainId: 1234,
          secondsPerBlock: 6,
          gasLimit: "1000000",
          gasPrice: 0,
          evmStackSize: 4096,
          contractSizeLimit: 100_000,
        });
        return Promise.resolve({
          algorithm: ALGORITHM.IBFTv2,
          config: {
            chainId: 1234,
            faucetWalletAddress: expectedAddress(validatorOverride + 1),
            gasLimit: "0x1",
            secondsPerBlock: 6,
          },
          genesis: { config: {}, extraData: "0xextra" } as any,
        });
      },
      promptForText: passthroughTextPrompt,
      service: {} as any,
      loadAllocations: () =>
        Promise.resolve({} satisfies Record<string, BesuAllocAccount>),
      outputResult: async () => {
        // no-op for test
      },
    };

    const options: CliOptions = {
      validators: validatorOverride,
      consensus: ALGORITHM.IBFTv2,
      chainId: 1234,
      secondsPerBlock: 6,
      gasLimit: "1000000",
      gasPrice: 0,
      evmStackSize: 4096,
      contractSizeLimit: 100_000,
    };

    await runBootstrap(options, deps);
  });

  test("createCliCommand rejects invalid numeric arguments", async () => {
    const shouldReject = async (args: string[], message: string) => {
      const command = createCliCommand();
      command.exitOverride();
      for (const child of command.commands) {
        child.exitOverride();
      }
      await expect(
        command.parseAsync(["node", "cli", "generate", ...args])
      ).rejects.toThrow(message);
    };

    await shouldReject(
      ["--chain-id", "0"],
      "Chain ID must be a positive integer."
    );
    await shouldReject(
      ["--gas-price", "-1"],
      "Gas price must be a non-negative integer."
    );
    await shouldReject(
      ["--gas-limit", "0"],
      "Gas limit must be a positive integer."
    );
    await shouldReject(
      ["--gas-limit", "not-a-number"],
      "Gas limit must be a positive integer."
    );
  });

  test("createCliCommand rejects unsupported output type", async () => {
    const command = createCliCommand();
    command.exitOverride();
    for (const child of command.commands) {
      child.exitOverride();
    }
    await expect(
      command.parseAsync(["node", "cli", "generate", "--outputType", "invalid"])
    ).rejects.toThrow(
      `Output type must be one of: ${["screen", "file", "kubernetes"].join(", ")}.`
    );
  });

  test("createCliCommand strips surrounding quotes from output type", async () => {
    let capturedOutputType: OutputType | undefined;
    const deps: BootstrapDependencies = {
      factory: createFactoryStub(),
      promptForCount: () => Promise.resolve(EXPECTED_DEFAULT_VALIDATOR),
      promptForGenesis: async () => ({
        algorithm: ALGORITHM.QBFT,
        config: {
          chainId: 1,
          faucetWalletAddress: expectedAddress(EXPECTED_DEFAULT_VALIDATOR + 1),
          gasLimit: "0x1",
          gasPrice: 0,
          secondsPerBlock: 2,
        },
        genesis: { config: {}, extraData: "0x" } as any,
      }),
      promptForText: passthroughTextPrompt,
      service: {} as any,
      loadAllocations: () =>
        Promise.resolve({} satisfies Record<string, BesuAllocAccount>),
      outputResult: (type) => {
        capturedOutputType = type;
        return Promise.resolve();
      },
    };

    const command = createCliCommand(deps);
    const generate = command.commands.find(
      (child) => child.name() === "generate"
    );
    expect(generate).toBeDefined();
    command.exitOverride();
    for (const child of command.commands) {
      child.exitOverride();
    }
    await expect(
      command.parseAsync(
        [
          "node",
          "cli",
          "generate",
          '--outputType="kubernetes"',
          "--accept-defaults",
        ],
        { from: "node" }
      )
    ).resolves.toBeDefined();
    expect(generate?.opts().outputType).toBe("kubernetes");
    expect(capturedOutputType).toBe("kubernetes");
  });

  test("createCliCommand rejects unsupported consensus", async () => {
    const command = createCliCommand();
    command.exitOverride();
    for (const child of command.commands) {
      child.exitOverride();
    }
    await expect(
      command.parseAsync(["node", "cli", "generate", "--consensus", "invalid"])
    ).rejects.toThrow(
      `Consensus must be one of: ${Object.values(ALGORITHM).join(", ")}.`
    );
  });

  test("runBootstrap accepts defaults without prompting when flag provided", async () => {
    const factory = createFactoryStub();
    let promptCountInvocations = 0;
    let loadAllocationsInvoked = false;

    const deps: BootstrapDependencies = {
      factory,
      promptForCount: () => {
        promptCountInvocations += 1;
        return Promise.resolve(0);
      },
      promptForGenesis: (_service, options) => {
        expect(options.autoAcceptDefaults).toBe(true);
        expect(options.preset).toEqual({
          algorithm: undefined,
          chainId: undefined,
          secondsPerBlock: undefined,
          gasLimit: undefined,
          gasPrice: undefined,
          evmStackSize: undefined,
          contractSizeLimit: undefined,
        });

        return Promise.resolve({
          algorithm: ALGORITHM.QBFT,
          config: {
            chainId: 1,
            faucetWalletAddress: expectedAddress(
              EXPECTED_DEFAULT_VALIDATOR + 1
            ),
            gasLimit: "0x1",
            secondsPerBlock: 2,
          },
          genesis: { config: {}, extraData: "0xextra" } as any,
        });
      },
      promptForText: passthroughTextPrompt,
      service: {} as any,
      loadAllocations: () => {
        loadAllocationsInvoked = true;
        return Promise.resolve({} as Record<string, BesuAllocAccount>);
      },
      outputResult: (_type, payload) => {
        expect(payload.validators).toHaveLength(EXPECTED_DEFAULT_VALIDATOR);
        expect(payload.artifactNames).toEqual({
          faucetPrefix: DEFAULT_FAUCET_PREFIX,
          validatorPrefix: DEFAULT_POD_PREFIX,
          genesisConfigMapName: DEFAULT_GENESIS_CONFIGMAP_NAME,
          staticNodesConfigMapName: DEFAULT_STATIC_NODES_CONFIGMAP_NAME,
        });
        return Promise.resolve();
      },
    };

    await runBootstrap(
      {
        acceptDefaults: true,
      },
      deps
    );

    expect(promptCountInvocations).toBe(0);
    expect(loadAllocationsInvoked).toBe(false);
  });
});
