import { Hex, Rlp } from "ox";

type HexString = Hex.Hex;

export const ALGORITHM = {
  ibftV2: "IBFTv2",
  qbft: "QBFT",
} as const;

export type Algorithm = (typeof ALGORITHM)[keyof typeof ALGORITHM];

export type BesuGenesis = {
  readonly config: BesuGenesisConfig;
  readonly nonce: HexString;
  readonly timestamp: HexString;
  readonly gasLimit: HexString;
  readonly difficulty: HexString;
  readonly mixHash: HexString;
  readonly coinbase: HexString;
  readonly alloc: Record<string, BesuAllocAccount>;
  readonly extraData: HexString | "";
};

type BesuGenesisConfig = {
  readonly chainId: number;
  readonly homesteadBlock: number;
  readonly eip150Block: number;
  readonly eip150Hash: HexString;
  readonly eip155Block: number;
  readonly eip158Block: number;
  readonly byzantiumBlock: number;
  readonly constantinopleBlock: number;
  readonly petersburgBlock: number;
  readonly istanbulBlock: number;
  readonly muirGlacierBlock: number;
  readonly berlinBlock: number;
  readonly londonBlock: number;
  readonly shanghaiTime: number;
  readonly cancunTime: number;
  readonly zeroBaseFee: boolean;
  readonly contractSizeLimit?: number;
  readonly evmStackSize?: number;
  readonly ibft2?: BesuBftConfig;
  readonly qbft?: BesuBftConfig;
};

export type BesuNetworkConfig = {
  readonly chainId: number;
  readonly contractSizeLimit?: number;
  readonly evmStackSize?: number;
  readonly faucetWalletAddress: HexString;
  readonly gasLimit: HexString;
  readonly gasPrice?: number;
  readonly secondsPerBlock: number;
};

export type BesuAllocAccount = {
  readonly balance: HexString;
  readonly code?: HexString;
  readonly storage?: Record<string, HexString>;
};

type BesuBftConfig = {
  readonly blockperiodseconds: number;
  readonly epochlength: number;
  readonly xemptyblockperiodseconds: number;
  readonly requesttimeoutseconds: number;
};

const VANITY_DATA: HexString =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const EMPTY_HEX: HexString = "0x";
const ROUND_ZERO: HexString = "0x00000000";
const MIX_HASH: HexString =
  "0x63746963616c2062797a616e74696e65206661756c7420746f6c6572616e6365";
const COINBASE_ZERO: HexString = "0x0000000000000000000000000000000000000000";
const FAUCET_BALANCE: HexString =
  "0x446c3b15f9926687d2c40534fdb564000000000000";
const MINIMUM_BFT_BLOCK_PERIOD_SECONDS = 60;
const MINIMUM_ROUND_BUFFER_SECONDS = 5;
const ROUND_TIMEOUT_MULTIPLIER = 1.33;

/**
 * Generates Besu genesis objects using wevm's Ox RLP utilities.
 */
export class BesuGenesisService {
  private readonly defaultChainId: number;

  constructor(defaultChainId = 0) {
    this.defaultChainId = defaultChainId;
  }
  /**
   * Produces a Besu genesis definition with identical semantics to the reference
   * implementation that relied on ethers.js, while keeping the serialization
   * layer on the wevm toolchain.
   */
  generate(
    algorithm: Algorithm,
    config: BesuNetworkConfig,
    extraAllocations: Record<string, BesuAllocAccount> = {}
  ): BesuGenesis {
    const resolvedChainId = config.chainId ?? this.defaultChainId;
    const consensus = this.buildConsensusConfig(algorithm, config);

    return {
      config: {
        chainId: resolvedChainId,
        homesteadBlock: 0,
        eip150Block: 0,
        eip150Hash: VANITY_DATA,
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
        zeroBaseFee: (config.gasPrice ?? 0) === 0,
        contractSizeLimit: config.contractSizeLimit,
        evmStackSize: config.evmStackSize,
        ...consensus,
      },
      nonce: "0x0",
      timestamp: "0x0",
      gasLimit: config.gasLimit,
      difficulty: "0x1",
      mixHash: MIX_HASH,
      coinbase: COINBASE_ZERO,
      alloc: this.buildAlloc(config.faucetWalletAddress, extraAllocations),
      extraData: "",
    };
  }

  computeExtraData(
    algorithm: Algorithm,
    validators: readonly string[]
  ): HexString {
    const normalized = validators.map((validator) => {
      Hex.assert(validator, { strict: true });
      return validator as HexString;
    });
    if (algorithm === ALGORITHM.ibftV2) {
      return Rlp.fromHex([VANITY_DATA, normalized, EMPTY_HEX, ROUND_ZERO, []]);
    }

    return Rlp.fromHex([VANITY_DATA, normalized, [], EMPTY_HEX, []]);
  }

  private buildConsensusConfig(
    algorithm: Algorithm,
    config: BesuNetworkConfig
  ): Partial<Pick<BesuGenesisConfig, "ibft2" | "qbft">> {
    if (algorithm === ALGORITHM.ibftV2) {
      return { ibft2: this.generateBft(config) };
    }

    return { qbft: this.generateBft(config) };
  }

  private generateBft(config: BesuNetworkConfig): BesuBftConfig {
    const timeout = Math.floor(
      Math.max(MINIMUM_BFT_BLOCK_PERIOD_SECONDS, config.secondsPerBlock) +
        Math.max(
          MINIMUM_ROUND_BUFFER_SECONDS,
          config.secondsPerBlock * ROUND_TIMEOUT_MULTIPLIER
        )
    );

    return {
      blockperiodseconds: config.secondsPerBlock,
      epochlength: 30_000,
      xemptyblockperiodseconds: MINIMUM_BFT_BLOCK_PERIOD_SECONDS,
      requesttimeoutseconds: timeout,
    };
  }

  private buildAlloc(
    faucetWalletAddress: HexString,
    extraAllocations: Record<string, BesuAllocAccount>
  ): Record<string, BesuAllocAccount> {
    return {
      [faucetWalletAddress]: {
        balance: FAUCET_BALANCE,
      },
      ...extraAllocations,
    };
  }
}
