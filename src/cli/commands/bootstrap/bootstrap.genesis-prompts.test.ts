import { describe, expect, test } from "bun:test";
import { getAddress } from "viem";
import {
  ALGORITHM,
  type Algorithm,
  type BesuAllocAccount,
  type BesuGenesis,
  type BesuGenesisService,
} from "../../../genesis/besu-genesis.service.ts";
import {
  type HexAddress,
  type PromptOverrides,
  promptForGenesisConfig,
} from "./bootstrap.genesis-prompts.ts";

const CHAIN_ID_RESPONSE = 42;
const BLOCK_TIME_RESPONSE = 5;
const GAS_PRICE_RESPONSE = 10;
const GAS_LIMIT_DECIMAL = "9007199254740991";
const ZERO_GAS_PRICE = 0;
const HEX_RADIX = 16;
const SECOND_CHAIN_ID = 1;
const SECOND_BLOCK_TIME = 2;
const EVM_STACK_SIZE = 4096;
const CONTRACT_SIZE_LIMIT = 10_000;
const NEGATIVE_PRESET_INT = -1;
const NEGATIVE_BIG_VALUE = "-1";
const NON_NUMERIC_BIG_VALUE = "not-a-number";
const MIN_CHAIN_ID = 40_000;
const CHAIN_ID_RANGE = 10_000;
const DEFAULT_EVM_STACK_SIZE = 2048;
const DEFAULT_CONTRACT_SIZE_LIMIT = 2_147_483_647;
const RANDOM_HALF = 0.5;

const withCancel = <T>(value: T) => {
  const promise = Promise.resolve(value) as Promise<T> & { cancel: () => void };
  promise.cancel = () => {
    // intentional no-op for stub
  };
  return promise;
};

const createServiceStub = () => {
  const generated: BesuGenesis = {
    config: {
      chainId: 1,
      homesteadBlock: 0,
      eip150Block: 0,
      eip150Hash: "0x",
      eip155Block: 0,
      eip158Block: 0,
      byzantiumBlock: 0,
      constantinopleBlock: 0,
      petersburgBlock: 0,
      istanbulBlock: 0,
      muirGlacierBlock: 0,
      berlinBlock: 0,
      londonBlock: 0,
      shanghaiTime: 0,
      cancunTime: 0,
      zeroBaseFee: true,
    },
    nonce: "0x0",
    timestamp: "0x0",
    gasLimit: "0x0",
    difficulty: "0x0",
    mixHash: "0x0",
    coinbase: "0x0",
    alloc: {},
    extraData: "",
  };

  const calls: Parameters<BesuGenesisService["generate"]>[] = [];

  const service: Pick<BesuGenesisService, "generate" | "computeExtraData"> = {
    generate: (...args) => {
      calls.push(args);
      return generated;
    },
    computeExtraData: () => "0xextra" as const,
  };

  return { generated, calls, service };
};

const createOverrides = (values: {
  inputValues: string[];
  algorithm: keyof typeof ALGORITHM;
}): Partial<PromptOverrides> => {
  const { inputValues, algorithm } = values;
  let inputIndex = 0;
  const selectPrompt: PromptOverrides["selectPrompt"] = <Value>(
    _config: unknown
  ) => withCancel(ALGORITHM[algorithm] as Value);

  const inputPrompt: PromptOverrides["inputPrompt"] = (_config: unknown) => {
    const value = inputValues[inputIndex++];
    if (value === undefined) {
      throw new Error("Missing stub input value");
    }
    return withCancel(value);
  };

  return { selectPrompt, inputPrompt };
};

describe("promptForGenesisConfig", () => {
  const faucet: HexAddress = getAddress(
    "0x0000000000000000000000000000000000001234"
  );
  const validators: HexAddress[] = [
    getAddress("0x0000000000000000000000000000000000001111"),
    getAddress("0x0000000000000000000000000000000000002222"),
  ];

  test("returns genesis data", async () => {
    const { service, generated, calls } = createServiceStub();
    const allocations: Record<string, BesuAllocAccount> = {
      [faucet]: { balance: "0x02" },
    };
    const overrides = createOverrides({
      inputValues: [
        `${CHAIN_ID_RESPONSE}`,
        `${BLOCK_TIME_RESPONSE}`,
        GAS_LIMIT_DECIMAL,
        `${GAS_PRICE_RESPONSE}`,
        `${EVM_STACK_SIZE}`,
        `${CONTRACT_SIZE_LIMIT}`,
      ],
      algorithm: "ibftV2",
    });

    const result = await promptForGenesisConfig(
      service as unknown as BesuGenesisService,
      {
        allocations,
        faucetAddress: faucet,
        overrides,
        validatorAddresses: validators,
      }
    );

    expect(result.algorithm).toBe(ALGORITHM.ibftV2);
    expect(result.config.chainId).toBe(CHAIN_ID_RESPONSE);
    expect(result.config.secondsPerBlock).toBe(BLOCK_TIME_RESPONSE);
    expect(result.config.gasPrice).toBe(GAS_PRICE_RESPONSE);
    expect(result.config.evmStackSize).toBe(EVM_STACK_SIZE);
    expect(result.config.contractSizeLimit).toBe(CONTRACT_SIZE_LIMIT);
    expect(result.genesis.extraData).toBe("0xextra");
    expect(result.genesis).toEqual({ ...generated, extraData: "0xextra" });
    expect(calls).toHaveLength(1);
    const firstCall = calls[0];
    expect(firstCall).toBeDefined();
    if (firstCall) {
      const [, , providedAllocations] = firstCall;
      expect(providedAllocations).toEqual(allocations);
    }
  });

  test("supports zero gas price", async () => {
    const { service } = createServiceStub();
    const overrides = createOverrides({
      inputValues: [
        `${SECOND_CHAIN_ID}`,
        `${SECOND_BLOCK_TIME}`,
        "123456",
        `${ZERO_GAS_PRICE}`,
        `${EVM_STACK_SIZE}`,
        `${CONTRACT_SIZE_LIMIT}`,
      ],
      algorithm: "qbft",
    });

    const result = await promptForGenesisConfig(
      service as unknown as BesuGenesisService,
      {
        allocations: {} as Record<string, BesuAllocAccount>,
        faucetAddress: faucet,
        overrides,
        validatorAddresses: validators,
      }
    );

    expect(result.algorithm).toBe(ALGORITHM.qbft);
    expect(result.config.gasPrice).toBeUndefined();
  });

  test("uses preset values without prompting", async () => {
    const { service } = createServiceStub();
    const preset = {
      algorithm: ALGORITHM.qbft,
      chainId: 6543,
      secondsPerBlock: 7,
      gasLimit: "123456789",
      gasPrice: 0,
      evmStackSize: 5000,
      contractSizeLimit: 200_000,
    } as const;

    const overrides: Partial<PromptOverrides> = {
      selectPrompt: () => {
        throw new Error(
          "Select prompt should not be called when preset is provided."
        );
      },
      inputPrompt: () => {
        throw new Error(
          "Input prompt should not be called when preset is provided."
        );
      },
    };

    const result = await promptForGenesisConfig(
      service as unknown as BesuGenesisService,
      {
        allocations: {} as Record<string, BesuAllocAccount>,
        faucetAddress: faucet,
        overrides,
        preset,
        validatorAddresses: validators,
      }
    );

    expect(result.algorithm).toBe(ALGORITHM.qbft);
    expect(result.config.chainId).toBe(preset.chainId);
    expect(result.config.secondsPerBlock).toBe(preset.secondsPerBlock);
    expect(result.config.gasLimit).toBe(
      `0x${BigInt(preset.gasLimit).toString(HEX_RADIX)}`
    );
    expect(result.config.gasPrice).toBeUndefined();
    expect(result.config.evmStackSize).toBe(preset.evmStackSize);
    expect(result.config.contractSizeLimit).toBe(preset.contractSizeLimit);
  });

  test("rejects invalid preset algorithm", async () => {
    const { service } = createServiceStub();
    await expect(
      promptForGenesisConfig(service as unknown as BesuGenesisService, {
        allocations: {} as Record<string, BesuAllocAccount>,
        faucetAddress: faucet,
        overrides: {},
        preset: {
          algorithm: "INVALID" as Algorithm,
        },
        validatorAddresses: validators,
      })
    ).rejects.toThrow(
      `Consensus must be one of: ${Object.values(ALGORITHM).join(", ")}.`
    );
  });

  test("rejects invalid numeric presets", async () => {
    const { service } = createServiceStub();
    await expect(
      promptForGenesisConfig(service as unknown as BesuGenesisService, {
        allocations: {} as Record<string, BesuAllocAccount>,
        faucetAddress: faucet,
        preset: {
          algorithm: ALGORITHM.ibftV2,
          chainId: NEGATIVE_PRESET_INT,
          secondsPerBlock: NEGATIVE_PRESET_INT,
          gasLimit: NEGATIVE_BIG_VALUE,
          gasPrice: NEGATIVE_PRESET_INT,
          evmStackSize: NEGATIVE_PRESET_INT,
          contractSizeLimit: NEGATIVE_PRESET_INT,
        },
        validatorAddresses: validators,
      })
    ).rejects.toThrow("Chain ID must be a positive integer.");
  });

  test("rejects negative gas price preset", async () => {
    const { service } = createServiceStub();
    await expect(
      promptForGenesisConfig(service as unknown as BesuGenesisService, {
        allocations: {} as Record<string, BesuAllocAccount>,
        faucetAddress: faucet,
        preset: {
          algorithm: ALGORITHM.qbft,
          chainId: 1,
          secondsPerBlock: 1,
          gasLimit: "1000",
          gasPrice: NEGATIVE_PRESET_INT,
          evmStackSize: 2048,
          contractSizeLimit: 100_000,
        },
        validatorAddresses: validators,
      })
    ).rejects.toThrow("Gas price must be a non-negative integer.");
  });

  test("rejects invalid gas limit preset", async () => {
    const { service } = createServiceStub();
    await expect(
      promptForGenesisConfig(service as unknown as BesuGenesisService, {
        allocations: {} as Record<string, BesuAllocAccount>,
        faucetAddress: faucet,
        preset: {
          algorithm: ALGORITHM.ibftV2,
          chainId: 1,
          secondsPerBlock: 1,
          gasLimit: "-5",
          gasPrice: 0,
          evmStackSize: 2048,
          contractSizeLimit: 100_000,
        },
        validatorAddresses: validators,
      })
    ).rejects.toThrow("Gas limit must be a positive integer.");
  });

  test("rejects malformed gas limit preset", async () => {
    const { service } = createServiceStub();
    await expect(
      promptForGenesisConfig(service as unknown as BesuGenesisService, {
        allocations: {} as Record<string, BesuAllocAccount>,
        faucetAddress: faucet,
        preset: {
          algorithm: ALGORITHM.ibftV2,
          chainId: 1,
          secondsPerBlock: 1,
          gasLimit: NON_NUMERIC_BIG_VALUE,
          gasPrice: 0,
          evmStackSize: 2048,
          contractSizeLimit: 100_000,
        },
        validatorAddresses: validators,
      })
    ).rejects.toThrow("Gas limit must be a positive integer.");
  });

  test("autoAcceptDefaults uses defaults without prompting", async () => {
    const { service, generated } = createServiceStub();
    const originalRandom = Math.random;
    Math.random = () => RANDOM_HALF;

    const overrides: PromptOverrides = {
      selectPrompt: () => {
        throw new Error(
          "Select prompt should not be called when accepting defaults."
        );
      },
      inputPrompt: () => {
        throw new Error(
          "Input prompt should not be called when accepting defaults."
        );
      },
    };

    try {
      const result = await promptForGenesisConfig(
        service as unknown as BesuGenesisService,
        {
          allocations: {} as Record<string, BesuAllocAccount>,
          faucetAddress: faucet,
          overrides,
          autoAcceptDefaults: true,
          validatorAddresses: validators,
        }
      );

      const expectedChainId =
        Math.floor(RANDOM_HALF * CHAIN_ID_RANGE) + MIN_CHAIN_ID;
      expect(result.algorithm).toBe(ALGORITHM.qbft);
      expect(result.config.chainId).toBe(expectedChainId);
      expect(result.config.secondsPerBlock).toBe(2);
      expect(result.config.gasLimit).toBe(
        `0x${BigInt(GAS_LIMIT_DECIMAL).toString(HEX_RADIX)}`
      );
      expect(result.config.gasPrice).toBeUndefined();
      expect(result.config.evmStackSize).toBe(DEFAULT_EVM_STACK_SIZE);
      expect(result.config.contractSizeLimit).toBe(DEFAULT_CONTRACT_SIZE_LIMIT);
      expect(result.genesis).toEqual({
        ...generated,
        extraData: "0xextra",
      });
    } finally {
      Math.random = originalRandom;
    }
  });
});
