import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  ARTIFACT_ANNOTATION_KEY,
  ARTIFACT_VALUES,
} from "../../../constants/artifact-annotations.ts";
import type {
  BesuAllocAccount,
  BesuGenesis,
} from "../../../genesis/besu-genesis.service.ts";
import type { GeneratedNodeKey } from "../../../keys/node-key-factory.ts";
import type {
  ConfigMapEntrySpec,
  SecretEntrySpec,
} from "../../integrations/kubernetes/kubernetes.client.ts";
import {
  createConfigMap,
  createKubernetesClient,
  createSecret,
  toAllocationConfigMapName,
} from "../../integrations/kubernetes/kubernetes.client.ts";
import type { AbiArtifact } from "./bootstrap.abis.ts";
import { accent, label, muted } from "./bootstrap.colors.ts";
import { SUBGRAPH_HASH_KEY } from "./bootstrap.subgraph.ts";

type IndexedNode = GeneratedNodeKey & { index: number };

type OutputType = "screen" | "file" | "kubernetes";

type ArtifactNames = {
  faucetPrefix: string;
  validatorPrefix: string;
  genesisConfigMapName: string;
  staticNodesConfigMapName: string;
  subgraphConfigMapName: string;
};

type OutputPayload = {
  faucet: GeneratedNodeKey;
  genesis: BesuGenesis;
  validators: readonly IndexedNode[];
  staticNodes: readonly string[];
  artifactNames: ArtifactNames;
  abiArtifacts: readonly AbiArtifact[];
  subgraphHash?: string;
};

type ConfigMapSpec = ConfigMapEntrySpec;
type SecretSpec = SecretEntrySpec;

const OUTPUT_DIR = "out";
const MILLISECOND_PAD_WIDTH = 3;
const ZERO_BALANCE = "0x0";

const logNonScreenStep = (message: string): void => {
  process.stdout.write(`${muted(`[bootstrap] ${message}`)}\n`);
};

const addressesEqual = (left: string, right: string): boolean =>
  left.toLowerCase() === right.toLowerCase();

const createSparseAlloc = (
  alloc: Record<string, BesuAllocAccount>,
  faucetAddress: string
): Record<string, BesuAllocAccount> => {
  const sparse: Record<string, BesuAllocAccount> = {};
  for (const [address, account] of Object.entries(alloc)) {
    if (addressesEqual(address, faucetAddress)) {
      sparse[address] = account;
      continue;
    }
    sparse[address] = { balance: ZERO_BALANCE };
  }
  return sparse;
};

const createAllocationConfigSpecs = (
  alloc: Record<string, BesuAllocAccount>,
  faucetAddress: string
): ConfigMapSpec[] => {
  const specs: ConfigMapSpec[] = [];
  for (const [address, account] of Object.entries(alloc)) {
    if (addressesEqual(address, faucetAddress)) {
      continue;
    }
    specs.push({
      name: toAllocationConfigMapName(address),
      key: "alloc.json",
      value: `${JSON.stringify(account, null, 2)}\n`,
      immutable: true,
      onConflict: "skip" as const,
      annotations: {
        [ARTIFACT_ANNOTATION_KEY]: ARTIFACT_VALUES.alloc,
      },
    });
  }
  return specs;
};

const createAbiConfigSpecs = (
  artifacts: readonly AbiArtifact[]
): ConfigMapSpec[] =>
  artifacts.map((artifact) => ({
    name: artifact.configMapName,
    key: artifact.fileName,
    value: artifact.contents,
    immutable: true,
    onConflict: "skip" as const,
    annotations: {
      [ARTIFACT_ANNOTATION_KEY]: ARTIFACT_VALUES.abi,
    },
  }));

const printGroup = (title: string, nodes: readonly IndexedNode[]): void => {
  if (nodes.length === 0) {
    return;
  }

  process.stdout.write(`${accent(title)}\n`);
  for (const node of nodes) {
    process.stdout.write(`  ${label(`#${node.index}`)}\n`);
    process.stdout.write(`    address: ${node.address}\n`);
    process.stdout.write(`    publicKey: ${node.publicKey}\n`);
    process.stdout.write(`    privateKey: ${node.privateKey}\n`);
    process.stdout.write(`    enode: ${node.enode}\n`);
  }
  process.stdout.write("\n");
};

const printStaticNodes = (staticNodes: readonly string[]): void => {
  if (staticNodes.length === 0) {
    return;
  }

  process.stdout.write(`${accent("Static Nodes")}\n`);
  process.stdout.write(`${JSON.stringify(staticNodes, null, 2)}\n\n`);
};

const printFaucet = (faucet: GeneratedNodeKey): void => {
  process.stdout.write(`${accent("Faucet Account")}\n`);
  process.stdout.write(`  address: ${faucet.address}\n`);
  process.stdout.write(`  publicKey: ${faucet.publicKey}\n`);
  process.stdout.write(`  privateKey: ${faucet.privateKey}\n`);
  process.stdout.write(`  enode: ${faucet.enode}\n\n`);
};

const printGenesis = (title: string, genesisJson: string): void => {
  process.stdout.write(`${accent(title)}\n`);
  process.stdout.write(`${genesisJson}\n\n`);
};

const outputToScreen = (payload: OutputPayload): void => {
  const genesisJson = JSON.stringify(payload.genesis, null, 2);
  process.stdout.write("\n\n");
  printGenesis("Genesis", genesisJson);
  printGroup("Validator Nodes", payload.validators);
  printStaticNodes(payload.staticNodes);
  printFaucet(payload.faucet);
};

const formatTimestampForDirectory = (date: Date): string => {
  const pad = (value: number, width = 2) =>
    value.toString().padStart(width, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const milliseconds = pad(date.getMilliseconds(), MILLISECOND_PAD_WIDTH);
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}-${milliseconds}`;
};

const outputToFile = async (payload: OutputPayload): Promise<string> => {
  logNonScreenStep("Preparing filesystem output directory");
  const timestamp = formatTimestampForDirectory(new Date());
  const directory = join(OUTPUT_DIR, timestamp);
  await mkdir(directory, { recursive: true });
  logNonScreenStep(`Created ${directory}`);

  const { artifactNames, abiArtifacts } = payload;
  const validatorSpecs = createValidatorSpecs(
    payload.validators,
    artifactNames.validatorPrefix
  );

  const faucetConfigSpecs = createFaucetConfigSpecs(
    payload.faucet,
    artifactNames.faucetPrefix
  );
  const faucetSecretSpecs = createFaucetSecretSpecs(
    payload.faucet,
    artifactNames.faucetPrefix
  );
  const faucetSpecs: ConfigMapSpec[] = [
    ...faucetConfigSpecs,
    ...faucetSecretSpecs,
    {
      name: `${artifactNames.faucetPrefix}-enode`,
      key: "enode",
      value: payload.faucet.enode,
    },
  ];

  const fileEntries: Array<{
    path: string;
    description: string;
    contents: string;
  }> = [
    {
      path: join(directory, `${artifactNames.genesisConfigMapName}.json`),
      description: `${artifactNames.genesisConfigMapName}.json`,
      contents: `${JSON.stringify(payload.genesis, null, 2)}\n`,
    },
    ...[...validatorSpecs, ...faucetSpecs].map((spec) => ({
      path: join(directory, spec.name),
      description: spec.name,
      contents: `${JSON.stringify({ [spec.key]: spec.value }, null, 2)}\n`,
    })),
    ...abiArtifacts.map((artifact) => ({
      path: join(directory, `${artifact.configMapName}.json`),
      description: `${artifact.configMapName}.json`,
      contents: artifact.contents,
    })),
    {
      path: join(directory, `${artifactNames.staticNodesConfigMapName}.json`),
      description: `${artifactNames.staticNodesConfigMapName}.json`,
      contents: `${JSON.stringify(payload.staticNodes, null, 2)}\n`,
    },
  ];

  if (payload.subgraphHash) {
    fileEntries.push({
      path: join(directory, `${artifactNames.subgraphConfigMapName}.json`),
      description: `${artifactNames.subgraphConfigMapName}.json`,
      contents: `${JSON.stringify(
        { [SUBGRAPH_HASH_KEY]: `kit:${payload.subgraphHash}` },
        null,
        2
      )}\n`,
    });
  }

  for (const entry of fileEntries) {
    logNonScreenStep(`Writing ${entry.description}`);
  }

  await Promise.all(
    fileEntries.map((entry) => Bun.write(entry.path, entry.contents))
  );
  return directory;
};

const outputToKubernetes = async (payload: OutputPayload): Promise<void> => {
  const context = await createKubernetesClient();
  const { namespace } = context;
  logNonScreenStep(`Using Kubernetes namespace ${namespace}`);
  const { artifactNames } = payload;
  const sparseAlloc = createSparseAlloc(
    payload.genesis.alloc,
    payload.faucet.address
  );
  const minimalGenesis: BesuGenesis = {
    ...payload.genesis,
    alloc: sparseAlloc,
  };
  const allocationSpecs = createAllocationConfigSpecs(
    payload.genesis.alloc,
    payload.faucet.address
  );
  const validatorSpecs = createValidatorSpecs(
    payload.validators,
    artifactNames.validatorPrefix
  );
  const allSpecs = [...validatorSpecs];
  const configMapSpecs = [
    ...allSpecs.filter((spec) => spec.key !== "privateKey"),
    ...createFaucetConfigSpecs(payload.faucet, artifactNames.faucetPrefix),
    {
      name: artifactNames.genesisConfigMapName,
      key: "genesis.json",
      value: `${JSON.stringify(minimalGenesis, null, 2)}\n`,
      immutable: true,
      onConflict: "skip" as const,
    },
    {
      name: artifactNames.staticNodesConfigMapName,
      key: "static-nodes.json",
      value: `${JSON.stringify(payload.staticNodes, null, 2)}\n`,
    },
    ...createAbiConfigSpecs(payload.abiArtifacts),
    ...allocationSpecs,
  ];
  if (payload.subgraphHash) {
    configMapSpecs.push({
      name: artifactNames.subgraphConfigMapName,
      key: SUBGRAPH_HASH_KEY,
      value: payload.subgraphHash,
      immutable: true,
      onConflict: "skip",
    });
  }
  const secretSpecs = [
    ...allSpecs.filter((spec) => spec.key === "privateKey"),
    ...createFaucetSecretSpecs(payload.faucet, artifactNames.faucetPrefix),
  ];

  logNonScreenStep(
    `Applying ${configMapSpecs.length} ConfigMap specs and ${secretSpecs.length} Secret specs`
  );

  for (const spec of configMapSpecs) {
    logNonScreenStep(`ConfigMap → ${spec.name}`);
  }
  for (const spec of secretSpecs) {
    logNonScreenStep(`Secret → ${spec.name}`);
  }

  const createdConfigMaps = await Promise.all(
    configMapSpecs.map((spec) => createConfigMap(context, spec))
  );
  const createdSecrets = await Promise.all(
    secretSpecs.map((spec) => createSecret(context, spec))
  );

  const configMapCount = createdConfigMaps.filter(Boolean).length;
  const secretCount = createdSecrets.filter(Boolean).length;

  process.stdout.write(
    `Applied ${configMapCount} ConfigMaps and ${secretCount} Secrets in namespace ${namespace}.\n`
  );
};

const createValidatorSpecs = (
  nodes: readonly IndexedNode[],
  validatorPrefix: string
): ConfigMapSpec[] =>
  nodes.flatMap<ConfigMapSpec>((node) => {
    // Align artifact names with 0-indexed StatefulSet pod ordinals.
    const ordinal = node.index - 1;
    const base = `${validatorPrefix}-${ordinal}`;
    return [
      { name: `${base}-address`, key: "address", value: node.address },
      {
        name: `${base}-private-key`,
        key: "privateKey",
        value: node.privateKey,
      },
      { name: `${base}-enode`, key: "enode", value: node.enode },
      { name: `${base}-pubkey`, key: "publicKey", value: node.publicKey },
    ];
  });

const createFaucetConfigSpecs = (
  faucet: GeneratedNodeKey,
  prefix: string
): ConfigMapSpec[] => [
  { name: `${prefix}-address`, key: "address", value: faucet.address },
  { name: `${prefix}-pubkey`, key: "publicKey", value: faucet.publicKey },
];

const createFaucetSecretSpecs = (
  faucet: GeneratedNodeKey,
  prefix: string
): SecretSpec[] => [
  {
    name: `${prefix}-private-key`,
    key: "privateKey",
    value: faucet.privateKey,
  },
];

const outputResult = async (
  type: OutputType,
  payload: OutputPayload
): Promise<void> => {
  if (type === "screen") {
    outputToScreen(payload);
    return;
  }

  if (type === "file") {
    logNonScreenStep("Output mode: file");
    const directory = await outputToFile(payload);
    process.stdout.write(`Wrote bootstrap artifacts to ${directory}.\n`);
    return;
  }

  if (type === "kubernetes") {
    logNonScreenStep("Output mode: kubernetes");
    await outputToKubernetes(payload);
    return;
  }

  const exhaustiveCheck: never = type;
  throw new Error(`Unsupported output type: ${exhaustiveCheck}`);
};

export type { ArtifactNames, IndexedNode, OutputPayload, OutputType };
export { outputResult, printFaucet, printGenesis, printGroup };
