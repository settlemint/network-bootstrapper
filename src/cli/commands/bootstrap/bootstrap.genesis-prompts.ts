import { input as inputPrompt, select } from "@inquirer/prompts";
import type { Address } from "viem";
import {
  ALGORITHM,
  type Algorithm,
  type BesuAllocAccount,
  type BesuGenesis,
  type BesuGenesisService,
  type BesuNetworkConfig,
} from "../../../genesis/besu-genesis.service.ts";
import { accent } from "./bootstrap.colors.ts";
import {
  ABORT_MESSAGE,
  ABORT_OPTION,
  promptForBigIntString,
  promptForInteger,
} from "./bootstrap.prompt-helpers.ts";

const HEX_RADIX = 16;

type HexValue = `0x${string}`;
type HexAddress = Address;

const MIN_CHAIN_ID = 40_000;
const CHAIN_ID_RANGE = 10_000;
const DEFAULT_EVM_STACK_SIZE = 2048;
const DEFAULT_CONTRACT_SIZE_LIMIT = 2_147_483_647;

const createDefaultNetworkSettings = () => ({
  chainId: Math.floor(Math.random() * CHAIN_ID_RANGE) + MIN_CHAIN_ID,
  secondsPerBlock: 2,
  gasPrice: 0,
  gasLimit: "9007199254740991",
  evmStackSize: DEFAULT_EVM_STACK_SIZE,
  contractSizeLimit: DEFAULT_CONTRACT_SIZE_LIMIT,
});

type InputPrompt = typeof inputPrompt;
type SelectPrompt = typeof select;

type GenesisPromptResult = {
  algorithm: Algorithm;
  config: BesuNetworkConfig;
  genesis: BesuGenesis;
};

type PromptOverrides = {
  inputPrompt: InputPrompt;
  selectPrompt: SelectPrompt;
};

type GenesisPromptPreset = {
  algorithm?: Algorithm;
  chainId?: number;
  secondsPerBlock?: number;
  gasLimit?: string;
  gasPrice?: number;
  evmStackSize?: number;
  contractSizeLimit?: number;
};

type GenesisPromptOptions = {
  allocations?: Record<string, BesuAllocAccount>;
  autoAcceptDefaults?: boolean;
  faucetAddress: HexAddress;
  overrides?: Partial<PromptOverrides>;
  preset?: GenesisPromptPreset;
  validatorAddresses: readonly HexAddress[];
};

const toHexString = (value: bigint): HexValue =>
  `0x${value.toString(HEX_RADIX)}`;

const ensurePositiveInteger = (value: number, label: string): number => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
};

const ensureNonNegativeInteger = (value: number, label: string): number => {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value;
};

const ensurePositiveBigIntString = (value: string, label: string): string => {
  const trimmed = value.trim();
  const parsed = (() => {
    try {
      return BigInt(trimmed);
    } catch (_error) {
      return null;
    }
  })();
  if (parsed === null || parsed <= 0n) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return trimmed;
};

const promptForGenesisConfig = async (
  service: BesuGenesisService,
  {
    allocations = {},
    autoAcceptDefaults = false,
    faucetAddress,
    overrides = {},
    preset,
    validatorAddresses,
  }: GenesisPromptOptions
): Promise<GenesisPromptResult> => {
  const {
    inputPrompt: inputFn = inputPrompt,
    selectPrompt: selectFn = select,
  } = overrides;

  const defaults = createDefaultNetworkSettings();

  const fallbackAlgorithm = ALGORITHM.QBFT;

  let resolvedAlgorithm: Algorithm;
  if (preset?.algorithm) {
    if (!Object.values(ALGORITHM).includes(preset.algorithm)) {
      throw new Error(
        `Consensus must be one of: ${Object.values(ALGORITHM).join(", ")}.`
      );
    }
    resolvedAlgorithm = preset.algorithm;
  } else if (autoAcceptDefaults) {
    resolvedAlgorithm = fallbackAlgorithm;
  } else {
    const algorithmSelection = await selectFn<Algorithm | typeof ABORT_OPTION>({
      message: accent("Select consensus algorithm"),
      choices: [
        { name: `${ABORT_OPTION} Abort`, value: ABORT_OPTION },
        ...Object.values(ALGORITHM).map((value) => ({
          name: value,
          value,
        })),
      ],
    });

    if (algorithmSelection === ABORT_OPTION) {
      throw new Error(ABORT_MESSAGE);
    }
    resolvedAlgorithm = algorithmSelection;
  }

  let chainId: number;
  if (preset?.chainId !== undefined) {
    chainId = ensurePositiveInteger(preset.chainId, "Chain ID");
  } else if (autoAcceptDefaults) {
    chainId = defaults.chainId;
  } else {
    chainId = await promptForInteger({
      defaultValue: defaults.chainId,
      labelText: "Chain ID",
      message: "Chain ID",
      min: 1,
      prompt: inputFn,
    });
  }

  let secondsPerBlock: number;
  if (preset?.secondsPerBlock !== undefined) {
    secondsPerBlock = ensurePositiveInteger(
      preset.secondsPerBlock,
      "Seconds per block"
    );
  } else if (autoAcceptDefaults) {
    secondsPerBlock = defaults.secondsPerBlock;
  } else {
    secondsPerBlock = await promptForInteger({
      defaultValue: defaults.secondsPerBlock,
      labelText: "Seconds per block",
      message: "Seconds per block",
      min: 1,
      prompt: inputFn,
    });
  }

  let gasLimitInput: string;
  if (preset?.gasLimit !== undefined) {
    gasLimitInput = ensurePositiveBigIntString(preset.gasLimit, "Gas limit");
  } else if (autoAcceptDefaults) {
    gasLimitInput = defaults.gasLimit;
  } else {
    gasLimitInput = await promptForBigIntString({
      defaultValue: defaults.gasLimit,
      labelText: "Block gas limit",
      message: "Block gas limit (decimal)",
      prompt: inputFn,
    });
  }

  let gasPrice: number;
  if (preset?.gasPrice !== undefined) {
    gasPrice = ensureNonNegativeInteger(preset.gasPrice, "Gas price");
  } else if (autoAcceptDefaults) {
    gasPrice = defaults.gasPrice;
  } else {
    gasPrice = await promptForInteger({
      defaultValue: defaults.gasPrice,
      labelText: "Base gas price",
      message: "Base gas price (wei)",
      min: 0,
      prompt: inputFn,
    });
    gasPrice = ensureNonNegativeInteger(gasPrice, "Gas price");
  }

  let evmStackSize: number;
  if (preset?.evmStackSize !== undefined) {
    evmStackSize = ensurePositiveInteger(preset.evmStackSize, "EVM stack size");
  } else if (autoAcceptDefaults) {
    evmStackSize = defaults.evmStackSize;
  } else {
    evmStackSize = await promptForInteger({
      defaultValue: defaults.evmStackSize,
      labelText: "EVM stack size",
      message: "EVM stack size",
      min: 1,
      prompt: inputFn,
    });
  }

  let contractSizeLimit: number;
  if (preset?.contractSizeLimit !== undefined) {
    contractSizeLimit = ensurePositiveInteger(
      preset.contractSizeLimit,
      "Contract size limit"
    );
  } else if (autoAcceptDefaults) {
    contractSizeLimit = defaults.contractSizeLimit;
  } else {
    contractSizeLimit = await promptForInteger({
      defaultValue: defaults.contractSizeLimit,
      labelText: "Contract size limit",
      message: "Contract size limit (bytes)",
      min: 1,
      prompt: inputFn,
    });
  }

  const normalizedGasPrice = ensureNonNegativeInteger(gasPrice, "Gas price");

  const config: BesuNetworkConfig = {
    chainId,
    faucetWalletAddress: faucetAddress,
    gasLimit: toHexString(BigInt(gasLimitInput.trim())),
    gasPrice: normalizedGasPrice > 0 ? normalizedGasPrice : undefined,
    secondsPerBlock,
    evmStackSize,
    contractSizeLimit,
  };

  const baseGenesis = service.generate(resolvedAlgorithm, config, allocations);
  const extraData = service.computeExtraData(
    resolvedAlgorithm,
    validatorAddresses
  );

  const genesis: BesuGenesis = {
    ...baseGenesis,
    extraData,
  };

  return {
    algorithm: resolvedAlgorithm,
    config,
    genesis,
  };
};

export type {
  GenesisPromptOptions,
  GenesisPromptResult,
  HexAddress,
  PromptOverrides,
  GenesisPromptPreset,
};
export { promptForGenesisConfig };
