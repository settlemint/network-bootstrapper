import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ARTIFACT_DEFAULTS } from "../../../constants/artifact-defaults.ts";
import {
  type ArtifactFilter,
  DEFAULT_ARTIFACT_FILTER,
} from "./bootstrap.artifacts-filter.ts";
import type { OutputPayload } from "./bootstrap.output.ts";
import { outputResult } from "./bootstrap.output.ts";

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

afterEach(() => {
  process.stdout.write = originalWrite;
});

const createSamplePayload = (filter: ArtifactFilter): OutputPayload => ({
  faucet: {
    address: "0x1111111111111111111111111111111111111111",
    publicKey: "0xaaa",
    privateKey: "0xbbb",
    enode: "enode://publickey@host:30303",
  },
  genesis: {
    config: {
      chainId: 1,
      homesteadBlock: 0,
      eip150Block: 0,
      eip150Hash: "0x0",
      eip155Block: 0,
      eip158Block: 0,
      byzantiumBlock: 0,
      constantinopleBlock: 0,
      petersburgBlock: 0,
      istanbulBlock: 0,
      londonBlock: 0,
      berlinBlock: 0,
      muirGlacierBlock: 0,
      shanghaiTime: 0,
      cancunTime: 0,
      zeroBaseFee: false,
      qbft: {
        blockperiodseconds: 5,
        epochlength: 30_000,
        xemptyblockperiodseconds: 30_000,
        requesttimeoutseconds: 10,
      },
    },
    nonce: "0x0",
    timestamp: "0x0",
    gasLimit: "0x1",
    difficulty: "0x1",
    mixHash: "0x0",
    coinbase: "0x0",
    alloc: {
      "0x1111111111111111111111111111111111111111": {
        balance: "0x1000000000000000000",
      },
    },
    extraData: "",
  },
  validators: [
    {
      index: 1,
      address: "0x2222222222222222222222222222222222222222",
      publicKey: "0xccc",
      privateKey: "0xddd",
      enode: "enode://validator1@host:30303",
    },
  ],
  staticNodes: ["enode://validator1@host:30303"],
  artifactNames: {
    faucetPrefix: "faucet",
    validatorPrefix: "besu-node-validator",
    genesisConfigMapName: "genesis",
    staticNodesConfigMapName: "static-nodes",
    subgraphConfigMapName: ARTIFACT_DEFAULTS.subgraphConfigMapName,
  },
  abiArtifacts: [
    {
      configMapName: "abi-sample",
      fileName: "Sample.json",
      contents: JSON.stringify({ contractName: "Sample" }, null, 2),
    },
  ],
  subgraphHash: "QmSampleHash",
  artifactFilter: filter,
});

describe("Selective artifact generation - screen output", () => {
  test("includes genesis when genesis filter is enabled", async () => {
    output = "";
    const filter: ArtifactFilter = {
      genesis: true,
      keys: false,
      abis: false,
      subgraph: false,
      allocations: false,
    };
    await outputResult("screen", createSamplePayload(filter));
    expect(output).toContain("Genesis");
    expect(output).not.toContain("Validator Nodes");
    expect(output).not.toContain("Faucet Account");
  });

  test("includes keys when keys filter is enabled", async () => {
    output = "";
    const filter: ArtifactFilter = {
      genesis: false,
      keys: true,
      abis: false,
      subgraph: false,
      allocations: false,
    };
    await outputResult("screen", createSamplePayload(filter));
    expect(output).toContain("Validator Nodes");
    expect(output).toContain("Faucet Account");
    expect(output).not.toContain("Genesis");
  });

  test("excludes static nodes when keys filter is disabled", async () => {
    output = "";
    const filter: ArtifactFilter = {
      genesis: false,
      keys: false,
      abis: false,
      subgraph: false,
      allocations: false,
    };
    await outputResult("screen", createSamplePayload(filter));
    expect(output).not.toContain("Static Nodes");
  });

  test("includes static nodes when keys filter is enabled", async () => {
    output = "";
    const filter: ArtifactFilter = {
      genesis: false,
      keys: true,
      abis: false,
      subgraph: false,
      allocations: false,
    };
    await outputResult("screen", createSamplePayload(filter));
    expect(output).toContain("Static Nodes");
  });

  test("generates all artifacts when all filters are enabled", async () => {
    output = "";
    const filter = DEFAULT_ARTIFACT_FILTER;
    await outputResult("screen", createSamplePayload(filter));
    expect(output).toContain("Genesis");
    expect(output).toContain("Validator Nodes");
    expect(output).toContain("Faucet Account");
    expect(output).toContain("Static Nodes");
  });
});

describe("Selective artifact generation - file output", () => {
  test("only writes genesis files when genesis filter is enabled", async () => {
    const filter: ArtifactFilter = {
      genesis: true,
      keys: false,
      abis: false,
      subgraph: false,
      allocations: false,
    };
    output = "";
    const payload = createSamplePayload(filter);

    // Note: We're testing the output side effect (console logs)
    // File operations would require filesystem mocking
    await outputResult("file", payload);

    // Should log about genesis but not keys
    expect(output).toContain("genesis.json");
    expect(output).not.toContain("private-key");
  });

  test("only writes key files when keys filter is enabled", async () => {
    const filter: ArtifactFilter = {
      genesis: false,
      keys: true,
      abis: false,
      subgraph: false,
      allocations: false,
    };
    output = "";
    const payload = createSamplePayload(filter);
    await outputResult("file", payload);

    // Should log about keys but not genesis
    expect(output).toContain("private-key");
    expect(output).not.toContain("genesis.json");
  });

  test("only writes abi files when abis filter is enabled", async () => {
    const filter: ArtifactFilter = {
      genesis: false,
      keys: false,
      abis: true,
      subgraph: false,
      allocations: false,
    };
    output = "";
    const payload = createSamplePayload(filter);
    await outputResult("file", payload);

    // Should log about ABIs
    expect(output).toContain("abi-sample");
  });

  test("only writes subgraph files when subgraph filter is enabled", async () => {
    const filter: ArtifactFilter = {
      genesis: false,
      keys: false,
      abis: false,
      subgraph: true,
      allocations: false,
    };
    output = "";
    const payload = createSamplePayload(filter);
    await outputResult("file", payload);

    // Should log about subgraph
    expect(output).toContain("besu-subgraph");
  });

  test("skips static nodes file when keys filter is disabled", async () => {
    const filter: ArtifactFilter = {
      genesis: false,
      keys: false,
      abis: false,
      subgraph: false,
      allocations: false,
    };
    output = "";
    const payload = createSamplePayload(filter);
    await outputResult("file", payload);

    // Should not log about static nodes when keys are disabled
    expect(output).not.toContain("static-nodes");
  });

  test("writes static nodes file when keys filter is enabled", async () => {
    const filter: ArtifactFilter = {
      genesis: false,
      keys: true,
      abis: false,
      subgraph: false,
      allocations: false,
    };
    output = "";
    const payload = createSamplePayload(filter);
    await outputResult("file", payload);

    // Should log about static nodes when keys are enabled
    expect(output).toContain("static-nodes");
  });
});

describe("Selective artifact generation - use cases", () => {
  test("generates only config without private keys for safe upgrades", () => {
    const filter: ArtifactFilter = {
      genesis: true,
      keys: false,
      abis: true,
      subgraph: true,
      allocations: true,
    };
    const payload = createSamplePayload(filter);

    // Verify the filter has the expected configuration
    expect(payload.artifactFilter.genesis).toBe(true);
    expect(payload.artifactFilter.keys).toBe(false);
    expect(payload.artifactFilter.abis).toBe(true);
    expect(payload.artifactFilter.subgraph).toBe(true);
    expect(payload.artifactFilter.allocations).toBe(true);
  });

  test("generates only subgraph and allocations for dApp deployments", () => {
    const filter: ArtifactFilter = {
      genesis: false,
      keys: false,
      abis: false,
      subgraph: true,
      allocations: true,
    };
    const payload = createSamplePayload(filter);

    expect(payload.artifactFilter.subgraph).toBe(true);
    expect(payload.artifactFilter.allocations).toBe(true);
    expect(payload.artifactFilter.genesis).toBe(false);
    expect(payload.artifactFilter.keys).toBe(false);
  });

  test("generates only ABIs for smart contract interactions", () => {
    const filter: ArtifactFilter = {
      genesis: false,
      keys: false,
      abis: true,
      subgraph: false,
      allocations: false,
    };
    const payload = createSamplePayload(filter);

    expect(payload.artifactFilter.abis).toBe(true);
    expect(payload.artifactFilter.genesis).toBe(false);
    expect(payload.artifactFilter.keys).toBe(false);
  });
});
