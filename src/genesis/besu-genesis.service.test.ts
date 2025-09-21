import { describe, expect, test } from "bun:test";

import {
  ALGORITHM,
  type Algorithm,
  type BesuAllocAccount,
  BesuGenesisService,
} from "./besu-genesis.service.ts";

const service = new BesuGenesisService();

const CHAIN_ID = 123;
const GAS_LIMIT = "0x0000000000000000000000000000000000000001" as const;
const FAUCET = "0x00000000000000000000000000000000000000f0" as const;
const VALIDATOR = "0x0000000000000000000000000000000000000abc";
const MIN_EXTRA_LENGTH = 4;

const baseConfig = {
  chainId: CHAIN_ID,
  faucetWalletAddress: FAUCET,
  gasLimit: GAS_LIMIT,
  secondsPerBlock: 2,
};

describe("BesuGenesisService", () => {
  test("generate builds base genesis", () => {
    const genesis = service.generate(ALGORITHM.qbft, baseConfig);

    expect(genesis.config.chainId).toBe(CHAIN_ID);
    expect(genesis.gasLimit).toBe(GAS_LIMIT);
    expect(Object.keys(genesis.alloc)).toContain(FAUCET);
    expect(genesis.extraData).toBe("");
  });

  test("merges extra allocations", () => {
    const overrides: Record<string, BesuAllocAccount> = {
      [FAUCET]: { balance: "0x02" as const },
    };
    const withContracts = service.generate(
      ALGORITHM.qbft,
      baseConfig,
      overrides
    );
    expect(withContracts.alloc[FAUCET]?.balance).toBe("0x02");
  });

  test("generate configures IBFT consensus", () => {
    const genesis = service.generate(ALGORITHM.ibftV2, baseConfig);
    const consensus = genesis.config.ibft2;
    expect(consensus).toBeDefined();
    expect(consensus?.blockperiodseconds).toBe(baseConfig.secondsPerBlock);
    expect(consensus?.xemptyblockperiodseconds).toBeGreaterThan(0);
    expect(consensus?.requesttimeoutseconds).toBeGreaterThan(
      baseConfig.secondsPerBlock
    );
  });

  test("generate configures QBFT consensus", () => {
    const genesis = service.generate(ALGORITHM.qbft, baseConfig);
    const consensus = genesis.config.qbft;
    expect(consensus).toBeDefined();
    expect(consensus?.blockperiodseconds).toBe(baseConfig.secondsPerBlock);
    expect(consensus?.requesttimeoutseconds).toBeGreaterThan(0);
  });

  test("private helpers expose consensus configuration", () => {
    const bft = (
      service as unknown as {
        generateBft: (config: typeof baseConfig) => unknown;
      }
    ).generateBft(baseConfig);
    expect(
      (bft as { requesttimeoutseconds: number }).requesttimeoutseconds
    ).toBeGreaterThan(0);

    const consensus = (
      service as unknown as {
        buildConsensusConfig: (
          algorithm: Algorithm,
          config: typeof baseConfig
        ) => unknown;
      }
    ).buildConsensusConfig(ALGORITHM.ibftV2, baseConfig);
    expect(consensus).toHaveProperty("ibft2");

    const alloc = (
      service as unknown as {
        buildAlloc: (
          faucet: string,
          include: boolean
        ) => Record<string, unknown>;
      }
    ).buildAlloc(FAUCET, false);
    expect(alloc).toHaveProperty(FAUCET);
  });

  const algorithms: Algorithm[] = [ALGORITHM.ibftV2, ALGORITHM.qbft];

  for (const algorithm of algorithms) {
    test(`computeExtraData for ${algorithm}`, () => {
      const output = service.computeExtraData(algorithm, [VALIDATOR]);
      expect(output.startsWith("0x")).toBe(true);
      expect(output.length).toBeGreaterThan(MIN_EXTRA_LENGTH);
    });
  }
});
