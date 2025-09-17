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

const sampleNode = (index: number): IndexedNode => {
  const address = `0x${index.toString(16).padStart(40, "0")}` as `0x${string}`;
  const keyHex = index.toString(16).padStart(64, "0");
  const pubHex = index.toString(16).padStart(128, "0");
  return {
    index,
    address,
    publicKey: `0x${pubHex}` as `0x${string}`,
    privateKey: `0x${keyHex}` as `0x${string}`,
    enode: `0x${keyHex}` as `0x${string}`,
  };
};

const samplePayload: OutputPayload = {
  faucet: sampleNode(99),
  genesis: { config: { chainId: 1 }, extraData: "0xabc" },
  rpcNodes: [sampleNode(2)],
  validators: [sampleNode(1)],
};

describe("outputResult", () => {
  test("screen output routes through print helpers", async () => {
    output = "";
    await outputResult("screen", samplePayload);
    expect(output).toContain("Genesis");
    expect(output).toContain("Validator Nodes");
  });

  test("file output writes json artifacts", async () => {
    await rm("out", { recursive: true, force: true });

    await outputResult("file", samplePayload);

    const directories = await readdir("out");
    expect(directories.length).toBe(1);
    const targetDir = join("out", directories[0]!);
    const files = await readdir(targetDir);
    expect(files.sort()).toEqual(
      [
        "besu-faucet-address",
        "besu-faucet-enode",
        "besu-faucet-private-key",
        "besu-faucet-pubkey",
        "besu-node-rpc-node-2-address",
        "besu-node-rpc-node-2-enode",
        "besu-node-rpc-node-2-private-key",
        "besu-node-rpc-node-2-pubkey",
        "besu-node-validator-1-address",
        "besu-node-validator-1-enode",
        "besu-node-validator-1-private-key",
        "besu-node-validator-1-pubkey",
        "genesis",
      ].sort()
    );

    const genesisContent = await readFile(join(targetDir, "genesis"), "utf8");
    expect(genesisContent).toContain('"chainId": 1');

    await rm("out", { recursive: true, force: true });
  });

  test("kubernetes output creates configmaps", async () => {
    const originalLoad = (KubeConfig.prototype as any).loadFromCluster;
    const originalMake = (KubeConfig.prototype as any).makeApiClient;
    const originalFile = Bun.file;

    const created: Array<{
      namespace: string;
      name: string;
      data: Record<string, string>;
    }> = [];
    const listedNamespaces: string[] = [];

    try {
      (KubeConfig.prototype as any).loadFromCluster =
        function loadFromCluster() {
          // no-op for tests
        };

      (KubeConfig.prototype as any).makeApiClient = function makeApiClient() {
        const client = {
          listNamespacedConfigMap: async ({
            namespace,
          }: {
            namespace: string;
          }) => {
            listedNamespaces.push(namespace);
          },
          createNamespacedConfigMap: async ({
            namespace,
            body,
          }: {
            namespace: string;
            body: any;
          }) => {
            created.push({
              namespace,
              name: body?.metadata?.name ?? "",
              data: body?.data ?? {},
            });
          },
        };
        return client as unknown as CoreV1Api;
      };

      (Bun as any).file = () =>
        ({
          text: async () => "test-namespace",
        }) as unknown as ReturnType<typeof Bun.file>;

      await outputResult("kubernetes", samplePayload);

      expect(listedNamespaces).toEqual(["test-namespace"]);
      expect(created).toHaveLength(8);
      const names = created.map((entry) => entry.name).sort();
      expect(names).toContain("besu-node-validator-1-address");
      expect(names).toContain("besu-node-rpc-node-2-private-key");
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
        function loadFromCluster() {};
      (KubeConfig.prototype as any).makeApiClient = function makeApiClient() {
        const client = {
          listNamespacedConfigMap: async () => {},
          createNamespacedConfigMap: async () => {
            const error = {
              response: {
                statusCode: 409,
                body: { message: "already exists" },
              },
            };
            throw error;
          },
        };
        return client as unknown as CoreV1Api;
      };

      (Bun as any).file = () =>
        ({
          text: async () => "conflict-namespace",
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

  test("kubernetes output fails without cluster credentials", async () => {
    const originalLoad = (KubeConfig.prototype as any).loadFromCluster;
    const originalFile = Bun.file;

    try {
      (KubeConfig.prototype as any).loadFromCluster =
        function loadFromCluster() {
          throw new Error("no cluster");
        };
      (Bun as any).file = () =>
        ({
          text: async () => "ignored",
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
        function loadFromCluster() {};
      (KubeConfig.prototype as any).makeApiClient = originalMake;
      (Bun as any).file = () =>
        ({
          text: async () => {
            throw new Error("unreadable");
          },
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
        function loadFromCluster() {};
      (KubeConfig.prototype as any).makeApiClient = originalMake;
      (Bun as any).file = () =>
        ({
          text: async () => "  ",
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
        function loadFromCluster() {};
      (KubeConfig.prototype as any).makeApiClient = function makeApiClient() {
        const client = {
          listNamespacedConfigMap: async () => {
            throw { message: "forbidden" };
          },
        };
        return client as unknown as CoreV1Api;
      };
      (Bun as any).file = () =>
        ({
          text: async () => "ns",
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
        function loadFromCluster() {};
      (KubeConfig.prototype as any).makeApiClient = function makeApiClient() {
        const client = {
          listNamespacedConfigMap: async () => {},
          createNamespacedConfigMap: async () => {
            throw "boom";
          },
        };
        return client as unknown as CoreV1Api;
      };
      (Bun as any).file = () =>
        ({
          text: async () => "ns",
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
        function loadFromCluster() {};
      (KubeConfig.prototype as any).makeApiClient = function makeApiClient() {
        const client = {
          listNamespacedConfigMap: async () => {},
          createNamespacedConfigMap: async () => {
            const error = { statusCode: 500, message: "failed" };
            throw error;
          },
        };
        return client as unknown as CoreV1Api;
      };
      (Bun as any).file = () =>
        ({
          text: async () => "ns",
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
        function loadFromCluster() {};
      (KubeConfig.prototype as any).makeApiClient = function makeApiClient() {
        const client = {
          listNamespacedConfigMap: async () => {},
          createNamespacedConfigMap: async () => {
            throw { response: { status: 503 } };
          },
        };
        return client as unknown as CoreV1Api;
      };
      (Bun as any).file = () =>
        ({
          text: async () => "ns",
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
        function loadFromCluster() {};
      (KubeConfig.prototype as any).makeApiClient = function makeApiClient() {
        const client = {
          listNamespacedConfigMap: async () => {},
          createNamespacedConfigMap: async () => {
            throw { body: { message: "denied" } };
          },
        };
        return client as unknown as CoreV1Api;
      };
      (Bun as any).file = () =>
        ({
          text: async () => "ns",
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
