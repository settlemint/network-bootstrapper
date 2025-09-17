import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { type CoreV1Api, KubeConfig } from "@kubernetes/client-node";

import type { IndexedNode, OutputPayload, OutputType } from "./output.ts";
import {
  outputResult,
  printFaucet,
  printGenesis,
  printGroup,
} from "./output.ts";

let output = "";
let originalWrite: typeof process.stdout.write;
beforeEach(() => {
  originalWrite = process.stdout.write;
  output = "";
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
});

afterEach(() => {
  process.stdout.write = originalWrite;
});

describe("CLI output", () => {
  test("printGroup emits node details", () => {
    printGroup("Validators", [
      {
        index: 1,
        address: "0x1111",
        publicKey: "0xaaa",
        privateKey: "0xbbb",
        enode: "0xbbb",
      },
    ]);

    expect(output).toContain("Validators");
    expect(output).toContain("0x1111");
    expect(output).toContain("0xaaa");
  });

  test("printGroup skips empty nodes", () => {
    output = "";
    printGroup("Validators", []);
    expect(output).toBe("");
  });

  test("printFaucet emits faucet details", () => {
    printFaucet({
      address: "0x1234",
      publicKey: "0xabc",
      privateKey: "0xdef",
      enode: "0xdef",
    });

    expect(output).toContain("Faucet Account");
    expect(output).toContain("0xabc");
  });

  test("printGenesis shows title and payload", () => {
    const json = JSON.stringify({ foo: "bar" }, null, 2);
    printGenesis("Genesis", json);
    expect(output).toContain("Genesis");
    expect(output).toContain('"foo": "bar"');
  });
});

const ADDRESS_HEX_LENGTH = 40;
const PRIVATE_KEY_HEX_LENGTH = 64;
const PUBLIC_KEY_HEX_LENGTH = 128;
const HEX_RADIX = 16;
const SAMPLE_VALIDATOR_INDEX = 1;
const SAMPLE_FAUCET_INDEX = 99;
const EXPECTED_CONFIGMAP_COUNT = 7;
const EXPECTED_SECRET_COUNT = 2;
const HEX_PREFIX_PATTERN = /^0x/;
const TEST_CHAIN_ID = 1;
const HTTP_CONFLICT_STATUS = 409;
const HTTP_INTERNAL_ERROR_STATUS = 500;
const HTTP_SERVICE_UNAVAILABLE_STATUS = 503;
const LEADING_DOT_REGEX = /^\./u;
const DEFAULT_STATIC_NODE_PORT = 30_303;
const DEFAULT_STATIC_NODE_DISCOVERY_PORT = 30_303;
const SAMPLE_STATIC_DOMAIN = "svc.cluster.local";
const SAMPLE_STATIC_NAMESPACE = "network";

const sampleNode = (index: number): IndexedNode => {
  const hexValue = index.toString(HEX_RADIX);
  const address =
    `0x${hexValue.padStart(ADDRESS_HEX_LENGTH, "0")}` as `0x${string}`;
  const keyHex = hexValue.padStart(PRIVATE_KEY_HEX_LENGTH, "0");
  const pubHex = hexValue.padStart(PUBLIC_KEY_HEX_LENGTH, "0");
  return {
    index,
    address,
    publicKey: `0x${pubHex}` as `0x${string}`,
    privateKey: `0x${keyHex}` as `0x${string}`,
    enode: `0x${keyHex}` as `0x${string}`,
  };
};

const staticNodeUri = (
  node: IndexedNode,
  domain?: string,
  port = DEFAULT_STATIC_NODE_PORT,
  discoveryPort = DEFAULT_STATIC_NODE_DISCOVERY_PORT,
  namespace?: string
): string => {
  const trimmedDomain =
    domain === undefined || domain.trim().length === 0
      ? undefined
      : domain.trim().replace(LEADING_DOT_REGEX, "");
  const trimmedNamespace =
    namespace === undefined || namespace.trim().length === 0
      ? undefined
      : namespace.trim();
  const podName = `besu-node-validator-${node.index}-0`;
  const serviceName = `besu-node-validator-${node.index}`;
  const segments = [podName, serviceName];
  if (trimmedNamespace) {
    segments.push(trimmedNamespace);
  }
  if (trimmedDomain) {
    segments.push(trimmedDomain);
  }
  const host = segments.join(".");
  const publicKey = node.publicKey.startsWith("0x")
    ? node.publicKey.slice(2)
    : node.publicKey;
  return `enode://${publicKey}@${host}:${port}?discport=${discoveryPort}`;
};

const sampleValidator = sampleNode(SAMPLE_VALIDATOR_INDEX);
const sampleFaucet = sampleNode(SAMPLE_FAUCET_INDEX);

const samplePayload: OutputPayload = {
  faucet: sampleFaucet,
  genesis: { config: { chainId: TEST_CHAIN_ID }, extraData: "0xabc" },
  validators: [sampleValidator],
  staticNodes: [
    staticNodeUri(
      sampleValidator,
      SAMPLE_STATIC_DOMAIN,
      DEFAULT_STATIC_NODE_PORT,
      DEFAULT_STATIC_NODE_DISCOVERY_PORT,
      SAMPLE_STATIC_NAMESPACE
    ),
  ],
};

describe("outputResult", () => {
  test("screen output routes through print helpers", async () => {
    output = "";
    await outputResult("screen", samplePayload);
    expect(output).toContain("Genesis");
    expect(output).toContain("Validator Nodes");
    expect(output).toContain("Static Nodes");
  });

  test("file output writes json artifacts", async () => {
    await rm("out", { recursive: true, force: true });

    await outputResult("file", samplePayload);

    const directories = await readdir("out");
    expect(directories.length).toBe(1);
    const targetDir = directories[0];
    if (!targetDir) {
      throw new Error("expected compiled output directory");
    }
    const targetDirPath = join("out", targetDir);
    const files = await readdir(targetDirPath);
    expect(files.sort()).toEqual(
      [
        "besu-faucet-address",
        "besu-faucet-enode",
        "besu-faucet-private-key",
        "besu-faucet-pubkey",
        "besu-node-validator-1-address",
        "besu-node-validator-1-enode",
        "besu-node-validator-1-private-key",
        "besu-node-validator-1-pubkey",
        "genesis",
        "static-nodes.json",
      ].sort()
    );

    const genesisContent = await readFile(
      join(targetDirPath, "genesis"),
      "utf8"
    );
    expect(genesisContent).toContain(`"chainId": ${TEST_CHAIN_ID}`);

    const staticNodesContent = await readFile(
      join(targetDirPath, "static-nodes.json"),
      "utf8"
    );
    expect(JSON.parse(staticNodesContent)).toEqual(samplePayload.staticNodes);

    await rm("out", { recursive: true, force: true });
  });

  test("kubernetes output creates configmaps and secrets", async () => {
    const originalLoad = (KubeConfig.prototype as any).loadFromCluster;
    const originalMake = (KubeConfig.prototype as any).makeApiClient;
    const originalFile = Bun.file;

    const createdConfigMaps: Array<{
      namespace: string;
      name: string;
      data: Record<string, string>;
    }> = [];
    const createdSecrets: Array<{
      namespace: string;
      name: string;
      data: Record<string, string>;
    }> = [];
    const listedConfigNamespaces: string[] = [];
    const listedSecretNamespaces: string[] = [];

    try {
      (KubeConfig.prototype as any).loadFromCluster =
        function loadFromCluster(): void {
          /* no-op for tests */
        };

      (KubeConfig.prototype as any).makeApiClient = function makeApiClient() {
        const client = {
          listNamespacedConfigMap: ({ namespace }: { namespace: string }) => {
            listedConfigNamespaces.push(namespace);
            return Promise.resolve();
          },
          listNamespacedSecret: ({ namespace }: { namespace: string }) => {
            listedSecretNamespaces.push(namespace);
            return Promise.resolve();
          },
          createNamespacedConfigMap: ({
            namespace,
            body,
          }: {
            namespace: string;
            body: any;
          }) => {
            createdConfigMaps.push({
              namespace,
              name: body?.metadata?.name ?? "",
              data: body?.data ?? {},
            });
            return Promise.resolve();
          },
          createNamespacedSecret: ({
            namespace,
            body,
          }: {
            namespace: string;
            body: any;
          }) => {
            createdSecrets.push({
              namespace,
              name: body?.metadata?.name ?? "",
              data: body?.stringData ?? {},
            });
            return Promise.resolve();
          },
        };
        return client as unknown as CoreV1Api;
      };

      (Bun as any).file = () =>
        ({
          text: () => Promise.resolve("test-namespace"),
        }) as unknown as ReturnType<typeof Bun.file>;

      await outputResult("kubernetes", samplePayload);

      expect(listedConfigNamespaces).toEqual(["test-namespace"]);
      expect(listedSecretNamespaces).toEqual(["test-namespace"]);
      expect(createdConfigMaps).toHaveLength(EXPECTED_CONFIGMAP_COUNT);
      expect(createdSecrets).toHaveLength(EXPECTED_SECRET_COUNT);
      const mapNames = createdConfigMaps.map((entry) => entry.name).sort();
      expect(mapNames).toContain("besu-node-validator-1-address");
      expect(mapNames).toContain("besu-genesis");
      expect(mapNames).toContain("besu-faucet-address");
      expect(mapNames).toContain("besu-faucet-pubkey");
      expect(mapNames).toContain("besu-static-nodes");
      expect(mapNames).not.toContain("besu-faucet-enode");
      const secretNames = createdSecrets.map((entry) => entry.name).sort();
      expect(secretNames).toEqual([
        "besu-faucet-private-key",
        "besu-node-validator-1-private-key",
      ]);
      const privateKeySecret = createdSecrets.find((entry) =>
        entry.name.endsWith("validator-1-private-key")
      );
      expect(privateKeySecret?.data?.privateKey).toMatch(HEX_PREFIX_PATTERN);
      const staticNodesConfig = createdConfigMaps.find(
        (entry) => entry.name === "besu-static-nodes"
      );
      expect(staticNodesConfig?.data?.["static-nodes.json"]).toBeDefined();
      expect(
        JSON.parse(staticNodesConfig?.data?.["static-nodes.json"] ?? "[]")
      ).toEqual(samplePayload.staticNodes);
    } finally {
      (KubeConfig.prototype as any).loadFromCluster = originalLoad;
      (KubeConfig.prototype as any).makeApiClient = originalMake;
      (Bun as any).file = originalFile;
    }
  });

  test("kubernetes output surfaces conflict errors", async () => {
    const originalLoad = (KubeConfig.prototype as any).loadFromCluster;
    const originalMake = (KubeConfig.prototype as any).makeApiClient;
    const originalFile = Bun.file;

    try {
      (KubeConfig.prototype as any).loadFromCluster =
        function loadFromCluster(): void {
          /* no-op for tests */
        };
      (KubeConfig.prototype as any).makeApiClient = function makeApiClient() {
        const client = {
          listNamespacedConfigMap: () => Promise.resolve(),
          listNamespacedSecret: () => Promise.resolve(),
          createNamespacedConfigMap: () => {
            const error = new Error("already exists");
            (
              error as {
                response?: { statusCode: number; body: { message: string } };
              }
            ).response = {
              statusCode: HTTP_CONFLICT_STATUS,
              body: { message: "already exists" },
            };
            throw error;
          },
          createNamespacedSecret: () => Promise.resolve(),
        };
        return client as unknown as CoreV1Api;
      };

      (Bun as any).file = () =>
        ({
          text: () => Promise.resolve("conflict-namespace"),
        }) as unknown as ReturnType<typeof Bun.file>;

      await expect(outputResult("kubernetes", samplePayload)).rejects.toThrow(
        "ConfigMap besu-node-validator-1-address already exists. Delete it or choose a different output target."
      );
    } finally {
      (KubeConfig.prototype as any).loadFromCluster = originalLoad;
      (KubeConfig.prototype as any).makeApiClient = originalMake;
      (Bun as any).file = originalFile;
    }
  });

  test("kubernetes output surfaces secret conflict errors", async () => {
    const originalLoad = (KubeConfig.prototype as any).loadFromCluster;
    const originalMake = (KubeConfig.prototype as any).makeApiClient;
    const originalFile = Bun.file;

    try {
      (KubeConfig.prototype as any).loadFromCluster =
        function loadFromCluster(): void {
          /* no-op for tests */
        };
      (KubeConfig.prototype as any).makeApiClient = function makeApiClient() {
        const client = {
          listNamespacedConfigMap: () => Promise.resolve(),
          listNamespacedSecret: () => Promise.resolve(),
          createNamespacedConfigMap: () => Promise.resolve(),
          createNamespacedSecret: () => {
            const error = new Error("already exists");
            (
              error as {
                response?: { statusCode: number; body: { message: string } };
              }
            ).response = {
              statusCode: HTTP_CONFLICT_STATUS,
              body: { message: "already exists" },
            };
            throw error;
          },
        };
        return client as unknown as CoreV1Api;
      };

      (Bun as any).file = () =>
        ({
          text: () => Promise.resolve("secret-conflict-namespace"),
        }) as unknown as ReturnType<typeof Bun.file>;

      await expect(outputResult("kubernetes", samplePayload)).rejects.toThrow(
        "Secret besu-node-validator-1-private-key already exists. Delete it or choose a different output target."
      );
    } finally {
      (KubeConfig.prototype as any).loadFromCluster = originalLoad;
      (KubeConfig.prototype as any).makeApiClient = originalMake;
      (Bun as any).file = originalFile;
    }
  });

  test("kubernetes output fails without cluster credentials", async () => {
    const originalLoad = (KubeConfig.prototype as any).loadFromCluster;
    const originalFile = Bun.file;

    try {
      (KubeConfig.prototype as any).loadFromCluster =
        function loadFromCluster(): never {
          throw new Error("no cluster");
        };
      (Bun as any).file = () =>
        ({
          text: () => Promise.resolve("ignored"),
        }) as unknown as ReturnType<typeof Bun.file>;

      await expect(outputResult("kubernetes", samplePayload)).rejects.toThrow(
        "Kubernetes output requires running inside a cluster with service account credentials."
      );
    } finally {
      (KubeConfig.prototype as any).loadFromCluster = originalLoad;
      (Bun as any).file = originalFile;
    }
  });

  test("kubernetes output fails when namespace cannot be read", async () => {
    const originalLoad = (KubeConfig.prototype as any).loadFromCluster;
    const originalMake = (KubeConfig.prototype as any).makeApiClient;
    const originalFile = Bun.file;

    try {
      (KubeConfig.prototype as any).loadFromCluster =
        function loadFromCluster(): void {
          /* no-op for tests */
        };
      (KubeConfig.prototype as any).makeApiClient = originalMake;
      (Bun as any).file = () =>
        ({
          text: () => Promise.reject(new Error("unreadable")),
        }) as unknown as ReturnType<typeof Bun.file>;

      await expect(outputResult("kubernetes", samplePayload)).rejects.toThrow(
        "Unable to determine Kubernetes namespace from service account credentials."
      );
    } finally {
      (KubeConfig.prototype as any).loadFromCluster = originalLoad;
      (KubeConfig.prototype as any).makeApiClient = originalMake;
      (Bun as any).file = originalFile;
    }
  });

  test("kubernetes output fails when namespace is empty", async () => {
    const originalLoad = (KubeConfig.prototype as any).loadFromCluster;
    const originalMake = (KubeConfig.prototype as any).makeApiClient;
    const originalFile = Bun.file;

    try {
      (KubeConfig.prototype as any).loadFromCluster =
        function loadFromCluster(): void {
          /* no-op for tests */
        };
      (KubeConfig.prototype as any).makeApiClient = originalMake;
      (Bun as any).file = () =>
        ({
          text: () => Promise.resolve("  "),
        }) as unknown as ReturnType<typeof Bun.file>;

      await expect(outputResult("kubernetes", samplePayload)).rejects.toThrow(
        "Kubernetes namespace could not be determined."
      );
    } finally {
      (KubeConfig.prototype as any).loadFromCluster = originalLoad;
      (KubeConfig.prototype as any).makeApiClient = originalMake;
      (Bun as any).file = originalFile;
    }
  });

  test("kubernetes output surfaces permission failures", async () => {
    const originalLoad = (KubeConfig.prototype as any).loadFromCluster;
    const originalMake = (KubeConfig.prototype as any).makeApiClient;
    const originalFile = Bun.file;

    try {
      (KubeConfig.prototype as any).loadFromCluster =
        function loadFromCluster(): void {
          /* no-op for tests */
        };
      (KubeConfig.prototype as any).makeApiClient = function makeApiClient() {
        const client = {
          listNamespacedConfigMap: () => Promise.reject(new Error("forbidden")),
          listNamespacedSecret: () => Promise.resolve(),
        };
        return client as unknown as CoreV1Api;
      };
      (Bun as any).file = () =>
        ({
          text: () => Promise.resolve("ns"),
        }) as unknown as ReturnType<typeof Bun.file>;

      await expect(outputResult("kubernetes", samplePayload)).rejects.toThrow(
        "Kubernetes permissions check failed: forbidden"
      );
    } finally {
      (KubeConfig.prototype as any).loadFromCluster = originalLoad;
      (KubeConfig.prototype as any).makeApiClient = originalMake;
      (Bun as any).file = originalFile;
    }
  });

  test("kubernetes output surfaces string errors", async () => {
    const originalLoad = (KubeConfig.prototype as any).loadFromCluster;
    const originalMake = (KubeConfig.prototype as any).makeApiClient;
    const originalFile = Bun.file;

    try {
      (KubeConfig.prototype as any).loadFromCluster =
        function loadFromCluster(): void {
          /* no-op for tests */
        };
      (KubeConfig.prototype as any).makeApiClient = function makeApiClient() {
        const client = {
          listNamespacedConfigMap: () => Promise.resolve(),
          listNamespacedSecret: () => Promise.resolve(),
          createNamespacedConfigMap: () => {
            throw new Error("boom");
          },
          createNamespacedSecret: () => Promise.resolve(),
        };
        return client as unknown as CoreV1Api;
      };
      (Bun as any).file = () =>
        ({
          text: () => Promise.resolve("ns"),
        }) as unknown as ReturnType<typeof Bun.file>;

      await expect(outputResult("kubernetes", samplePayload)).rejects.toThrow(
        "Failed to create ConfigMap besu-node-validator-1-address: boom"
      );
    } finally {
      (KubeConfig.prototype as any).loadFromCluster = originalLoad;
      (KubeConfig.prototype as any).makeApiClient = originalMake;
      (Bun as any).file = originalFile;
    }
  });

  test("kubernetes output surfaces error messages from objects", async () => {
    const originalLoad = (KubeConfig.prototype as any).loadFromCluster;
    const originalMake = (KubeConfig.prototype as any).makeApiClient;
    const originalFile = Bun.file;

    try {
      (KubeConfig.prototype as any).loadFromCluster =
        function loadFromCluster(): void {
          /* no-op for tests */
        };
      (KubeConfig.prototype as any).makeApiClient = function makeApiClient() {
        const client = {
          listNamespacedConfigMap: () => Promise.resolve(),
          listNamespacedSecret: () => Promise.resolve(),
          createNamespacedConfigMap: () => {
            const error = new Error("failed");
            (error as { statusCode?: number }).statusCode =
              HTTP_INTERNAL_ERROR_STATUS;
            throw error;
          },
          createNamespacedSecret: () => Promise.resolve(),
        };
        return client as unknown as CoreV1Api;
      };
      (Bun as any).file = () =>
        ({
          text: () => Promise.resolve("ns"),
        }) as unknown as ReturnType<typeof Bun.file>;

      await expect(outputResult("kubernetes", samplePayload)).rejects.toThrow(
        "Failed to create ConfigMap besu-node-validator-1-address: failed"
      );
    } finally {
      (KubeConfig.prototype as any).loadFromCluster = originalLoad;
      (KubeConfig.prototype as any).makeApiClient = originalMake;
      (Bun as any).file = originalFile;
    }
  });

  test("kubernetes output reports status from response objects", async () => {
    const originalLoad = (KubeConfig.prototype as any).loadFromCluster;
    const originalMake = (KubeConfig.prototype as any).makeApiClient;
    const originalFile = Bun.file;

    try {
      (KubeConfig.prototype as any).loadFromCluster =
        function loadFromCluster(): void {
          /* no-op for tests */
        };
      (KubeConfig.prototype as any).makeApiClient = function makeApiClient() {
        const client = {
          listNamespacedConfigMap: () => Promise.resolve(),
          listNamespacedSecret: () => Promise.resolve(),
          createNamespacedConfigMap: () => {
            const error = new Error("response error");
            Object.defineProperty(error, "message", { value: undefined });
            (error as { response?: { status: number } }).response = {
              status: HTTP_SERVICE_UNAVAILABLE_STATUS,
            };
            throw error;
          },
          createNamespacedSecret: () => Promise.resolve(),
        };
        return client as unknown as CoreV1Api;
      };
      (Bun as any).file = () =>
        ({
          text: () => Promise.resolve("ns"),
        }) as unknown as ReturnType<typeof Bun.file>;

      await expect(outputResult("kubernetes", samplePayload)).rejects.toThrow(
        "Failed to create ConfigMap besu-node-validator-1-address: unknown error"
      );
    } finally {
      (KubeConfig.prototype as any).loadFromCluster = originalLoad;
      (KubeConfig.prototype as any).makeApiClient = originalMake;
      (Bun as any).file = originalFile;
    }
  });

  test("kubernetes output surfaces error messages from response body", async () => {
    const originalLoad = (KubeConfig.prototype as any).loadFromCluster;
    const originalMake = (KubeConfig.prototype as any).makeApiClient;
    const originalFile = Bun.file;

    try {
      (KubeConfig.prototype as any).loadFromCluster =
        function loadFromCluster(): void {
          /* no-op for tests */
        };
      (KubeConfig.prototype as any).makeApiClient = function makeApiClient() {
        const client = {
          listNamespacedConfigMap: () => Promise.resolve(),
          listNamespacedSecret: () => Promise.resolve(),
          createNamespacedConfigMap: () => {
            const error = new Error("body error");
            Object.defineProperty(error, "message", { value: undefined });
            (error as { body?: { message: string } }).body = {
              message: "denied",
            };
            throw error;
          },
          createNamespacedSecret: () => Promise.resolve(),
        };
        return client as unknown as CoreV1Api;
      };
      (Bun as any).file = () =>
        ({
          text: () => Promise.resolve("ns"),
        }) as unknown as ReturnType<typeof Bun.file>;

      await expect(outputResult("kubernetes", samplePayload)).rejects.toThrow(
        "Failed to create ConfigMap besu-node-validator-1-address: denied"
      );
    } finally {
      (KubeConfig.prototype as any).loadFromCluster = originalLoad;
      (KubeConfig.prototype as any).makeApiClient = originalMake;
      (Bun as any).file = originalFile;
    }
  });

  test("outputResult rejects unsupported types", async () => {
    await expect(
      // Cast to bypass compile-time exhaustiveness so we can exercise the fallback path.
      outputResult("invalid" as OutputType, samplePayload)
    ).rejects.toThrow("Unsupported output type");
  });
});
