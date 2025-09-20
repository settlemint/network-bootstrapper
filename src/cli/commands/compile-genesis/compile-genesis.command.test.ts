import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { type CoreV1Api, KubeConfig } from "@kubernetes/client-node";

import { ARTIFACT_DEFAULTS } from "../../../constants/artifact-defaults.ts";
import {
  ALGORITHM,
  type BesuAllocAccount,
  BesuGenesisService,
} from "../../../genesis/besu-genesis.service.ts";
import { toAllocationConfigMapName } from "../../integrations/kubernetes/kubernetes.client.ts";
import { createCliCommand } from "../bootstrap/bootstrap.command.ts";
import {
  type CompileGenesisOptions,
  compileGenesis,
} from "./compile-genesis.command.ts";

const NAMESPACE_FILE =
  "/var/run/secrets/kubernetes.io/serviceaccount/namespace";
const OUTPUT_PATH = join("out", "compiled-genesis.json");
const ADDRESS_HEX_LENGTH = 40;
const FAUCET_ADDRESS = `0x${"a".repeat(ADDRESS_HEX_LENGTH)}` as `0x${string}`;
const EXTRA_ADDRESS = `0x${"b".repeat(ADDRESS_HEX_LENGTH)}` as `0x${string}`;
const SAMPLE_ACCOUNT: BesuAllocAccount = {
  balance: "0x1234",
  code: "0x6000",
  storage: {
    "0x1": "0x2",
  },
};

const genesisService = new BesuGenesisService();
const baseGenesis = genesisService.generate(
  ALGORITHM.QBFT,
  {
    chainId: 1337,
    faucetWalletAddress: FAUCET_ADDRESS,
    gasLimit: "0x1",
    gasPrice: 0,
    secondsPerBlock: 2,
  },
  {
    [EXTRA_ADDRESS]: SAMPLE_ACCOUNT,
  }
);

const minimalGenesis = {
  ...baseGenesis,
  alloc: {
    [FAUCET_ADDRESS]: baseGenesis.alloc[FAUCET_ADDRESS],
    [EXTRA_ADDRESS]: { balance: "0x0" },
  },
};

const allocationConfigMapName = toAllocationConfigMapName(EXTRA_ADDRESS);

const createNotFoundError = (): Error => {
  const error = new Error("not found");
  (error as { response?: { statusCode: number } }).response = {
    statusCode: 404,
  };
  return error;
};

const mockNamespaceFile = (original: typeof Bun.file) =>
  ((path: string | URL) => {
    if (path === NAMESPACE_FILE) {
      return {
        text: () => Promise.resolve("test-namespace"),
      } as ReturnType<typeof Bun.file>;
    }
    return original(path);
  }) as typeof Bun.file;

const restoreKubeMocks = (
  originalLoad: KubeConfig["loadFromCluster"],
  originalMake: KubeConfig["makeApiClient"],
  originalFile: typeof Bun.file
): void => {
  (KubeConfig.prototype as any).loadFromCluster = originalLoad;
  (KubeConfig.prototype as any).makeApiClient = originalMake;
  (Bun as any).file = originalFile;
};

beforeEach(async () => {
  await rm("out", { recursive: true, force: true });
});

afterEach(async () => {
  await rm("out", { recursive: true, force: true });
});

describe("compileGenesis", () => {
  test("merges allocation ConfigMaps into the genesis file", async () => {
    const originalLoad = (KubeConfig.prototype as any).loadFromCluster;
    const originalMake = (KubeConfig.prototype as any).makeApiClient;
    const originalFile = Bun.file;

    try {
      (KubeConfig.prototype as any).loadFromCluster = () => {
        /* no-op */
      };
      (KubeConfig.prototype as any).makeApiClient = () =>
        ({
          listNamespacedConfigMap: () => Promise.resolve(),
          listNamespacedSecret: () => Promise.resolve(),
          readNamespacedConfigMap: ({ name }: { name: string }) => {
            if (name === ARTIFACT_DEFAULTS.genesisConfigMapName) {
              return Promise.resolve({
                data: {
                  "genesis.json": JSON.stringify(minimalGenesis, null, 2),
                },
              });
            }
            if (name === allocationConfigMapName) {
              return Promise.resolve({
                data: {
                  "alloc.json": JSON.stringify(SAMPLE_ACCOUNT, null, 2),
                },
              });
            }
            throw createNotFoundError();
          },
        }) as unknown as CoreV1Api;

      (Bun as any).file = mockNamespaceFile(originalFile);

      const options: CompileGenesisOptions = {
        genesisConfigMapName: ARTIFACT_DEFAULTS.genesisConfigMapName,
        outputPath: OUTPUT_PATH,
      };

      await compileGenesis(options);

      const compiledText = await Bun.file(OUTPUT_PATH).text();
      const compiledGenesis = JSON.parse(compiledText) as {
        alloc: Record<string, BesuAllocAccount>;
      };
      expect(compiledGenesis.alloc[EXTRA_ADDRESS]).toEqual(SAMPLE_ACCOUNT);
      expect(compiledGenesis.alloc[FAUCET_ADDRESS]).toEqual(
        baseGenesis.alloc[FAUCET_ADDRESS]
      );
    } finally {
      restoreKubeMocks(originalLoad, originalMake, originalFile);
    }
  });

  test("keeps placeholders when allocation ConfigMap is missing", async () => {
    const originalLoad = (KubeConfig.prototype as any).loadFromCluster;
    const originalMake = (KubeConfig.prototype as any).makeApiClient;
    const originalFile = Bun.file;

    try {
      (KubeConfig.prototype as any).loadFromCluster = () => {
        /* no-op */
      };
      (KubeConfig.prototype as any).makeApiClient = () =>
        ({
          listNamespacedConfigMap: () => Promise.resolve(),
          listNamespacedSecret: () => Promise.resolve(),
          readNamespacedConfigMap: ({ name }: { name: string }) => {
            if (name === ARTIFACT_DEFAULTS.genesisConfigMapName) {
              return Promise.resolve({
                data: {
                  "genesis.json": JSON.stringify(minimalGenesis, null, 2),
                },
              });
            }
            throw createNotFoundError();
          },
        }) as unknown as CoreV1Api;

      (Bun as any).file = mockNamespaceFile(originalFile);

      await compileGenesis({
        genesisConfigMapName: ARTIFACT_DEFAULTS.genesisConfigMapName,
        outputPath: OUTPUT_PATH,
      });

      const compiledText = await Bun.file(OUTPUT_PATH).text();
      const compiledGenesis = JSON.parse(compiledText) as {
        alloc: Record<string, BesuAllocAccount>;
      };
      expect(compiledGenesis.alloc[EXTRA_ADDRESS]).toEqual({ balance: "0x0" });
    } finally {
      restoreKubeMocks(originalLoad, originalMake, originalFile);
    }
  });

  test("throws when genesis ConfigMap lacks genesis.json", async () => {
    const originalLoad = (KubeConfig.prototype as any).loadFromCluster;
    const originalMake = (KubeConfig.prototype as any).makeApiClient;
    const originalFile = Bun.file;

    try {
      (KubeConfig.prototype as any).loadFromCluster = () => {
        /* no-op */
      };
      (KubeConfig.prototype as any).makeApiClient = () =>
        ({
          listNamespacedConfigMap: () => Promise.resolve(),
          listNamespacedSecret: () => Promise.resolve(),
          readNamespacedConfigMap: () => Promise.resolve({ data: {} }),
        }) as unknown as CoreV1Api;

      (Bun as any).file = mockNamespaceFile(originalFile);

      await expect(
        compileGenesis({
          genesisConfigMapName: ARTIFACT_DEFAULTS.genesisConfigMapName,
          outputPath: OUTPUT_PATH,
        })
      ).rejects.toThrow("does not contain genesis.json");
    } finally {
      restoreKubeMocks(originalLoad, originalMake, originalFile);
    }
  });
});

describe("CLI integration", () => {
  test("registers the compile-genesis subcommand", () => {
    const command = createCliCommand();
    const subcommandNames = command.commands.map((entry) => entry.name());
    expect(subcommandNames).toContain("compile-genesis");
  });
});
