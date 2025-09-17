import { input as inputPrompt, select } from "@inquirer/prompts";
import type { Address } from "viem";
import {
  ALGORITHM,
  type Algorithm,
  type BesuAllocAccount,
  type BesuGenesis,
  type BesuGenesisService,
  type BesuNetworkConfig,
} from "../genesis/besu-genesis.service.ts";
import { accent } from "./colors.ts";
import {
  ABORT_MESSAGE,
  ABORT_OPTION,
  promptForBigIntString,
  promptForInteger,
} from "./prompt-helpers.ts";

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

  let resolvedAlgorithm: Algorithm;
  if (preset?.algorithm) {
    if (!Object.values(ALGORITHM).includes(preset.algorithm)) {
      throw new Error(
        `Consensus must be one of: ${Object.values(ALGORITHM).join(", ")}.`
      );
    }
    resolvedAlgorithm = preset.algorithm;
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

  const chainId = preset?.chainId
    ? ensurePositiveInteger(preset.chainId, "Chain ID")
    : await promptForInteger({
        defaultValue: defaults.chainId,
        labelText: "Chain ID",
        message: "Chain ID",
        min: 1,
        prompt: inputFn,
      });

  const secondsPerBlock = preset?.secondsPerBlock
    ? ensurePositiveInteger(preset.secondsPerBlock, "Seconds per block")
    : await promptForInteger({
        defaultValue: defaults.secondsPerBlock,
        labelText: "Seconds per block",
        message: "Seconds per block",
        min: 1,
        prompt: inputFn,
      });

  const gasLimitInput = preset?.gasLimit
    ? ensurePositiveBigIntString(preset.gasLimit, "Gas limit")
    : await promptForBigIntString({
        defaultValue: defaults.gasLimit,
        labelText: "Block gas limit",
        message: "Block gas limit (decimal)",
        prompt: inputFn,
      });

  const gasPrice =
    preset?.gasPrice ??
    (await promptForInteger({
      defaultValue: defaults.gasPrice,
      labelText: "Base gas price",
      message: "Base gas price (wei)",
      min: 0,
      prompt: inputFn,
    }));

  const normalizedGasPrice = ensureNonNegativeInteger(gasPrice, "Gas price");

  const evmStackSize = preset?.evmStackSize
    ? ensurePositiveInteger(preset.evmStackSize, "EVM stack size")
    : await promptForInteger({
        defaultValue: defaults.evmStackSize,
        labelText: "EVM stack size",
        message: "EVM stack size",
        min: 1,
        prompt: inputFn,
      });

  const contractSizeLimit = preset?.contractSizeLimit
    ? ensurePositiveInteger(preset.contractSizeLimit, "Contract size limit")
    : await promptForInteger({
        defaultValue: defaults.contractSizeLimit,
        labelText: "Contract size limit",
        message: "Contract size limit (bytes)",
        min: 1,
        prompt: inputFn,
      });

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
export const __testing = {
  ensurePositiveInteger,
  ensureNonNegativeInteger,
  ensurePositiveBigIntString,
};
