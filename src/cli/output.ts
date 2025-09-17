import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { V1ConfigMap } from "@kubernetes/client-node";
import { CoreV1Api, KubeConfig } from "@kubernetes/client-node";

import type { GeneratedNodeKey } from "../keys/node-key-factory.ts";
import { accent, label } from "./colors.ts";

type IndexedNode = GeneratedNodeKey & { index: number };

type OutputType = "screen" | "file" | "kubernetes";

type OutputPayload = {
  faucet: GeneratedNodeKey;
  genesis: unknown;
  rpcNodes: readonly IndexedNode[];
  validators: readonly IndexedNode[];
};

type ConfigMapSpec = {
  key: string;
  name: string;
  value: string;
};

const OUTPUT_DIR = "out";
const NAMESPACE_PATH =
  "/var/run/secrets/kubernetes.io/serviceaccount/namespace";
const MILLISECOND_PAD_WIDTH = 3;
const HTTP_CONFLICT_STATUS = 409;

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
  printGroup("RPC Nodes", payload.rpcNodes);
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
  const timestamp = formatTimestampForDirectory(new Date());
  const directory = join(OUTPUT_DIR, timestamp);
  await mkdir(directory, { recursive: true });

  const validatorSpecs = createSpecsForGroup("validator", payload.validators);
  const rpcSpecs = createSpecsForGroup("rpc-node", payload.rpcNodes);

  const faucetSpecs: ConfigMapSpec[] = [
    {
      name: "besu-faucet-address",
      key: "address",
      value: payload.faucet.address,
    },
    {
      name: "besu-faucet-private-key",
      key: "privateKey",
      value: payload.faucet.privateKey,
    },
    {
      name: "besu-faucet-enode",
      key: "enode",
      value: payload.faucet.enode,
    },
    {
      name: "besu-faucet-pubkey",
      key: "publicKey",
      value: payload.faucet.publicKey,
    },
  ];

  const writes: Promise<number>[] = [
    Bun.write(
      join(directory, "genesis"),
      `${JSON.stringify(payload.genesis, null, 2)}\n`
    ),
    ...[...validatorSpecs, ...rpcSpecs, ...faucetSpecs].map((spec) =>
      Bun.write(
        join(directory, spec.name),
        `${JSON.stringify({ [spec.key]: spec.value }, null, 2)}\n`
      )
    ),
  ];

  await Promise.all(writes);
  return directory;
};

const outputToKubernetes = async (payload: OutputPayload): Promise<void> => {
  const { client, namespace } = await createKubernetesClient();
  const validatorSpecs = createSpecsForGroup("validator", payload.validators);
  const rpcSpecs = createSpecsForGroup("rpc-node", payload.rpcNodes);
  const allSpecs = [...validatorSpecs, ...rpcSpecs];

  await Promise.all(
    allSpecs.map((spec) => upsertConfigMap(client, namespace, spec))
  );

  process.stdout.write(
    `Applied ${allSpecs.length} ConfigMaps in namespace ${namespace}.\n`
  );
};

const createSpecsForGroup = (
  group: "validator" | "rpc-node",
  nodes: readonly IndexedNode[]
): ConfigMapSpec[] => {
  const prefix =
    group === "validator" ? "besu-node-validator" : "besu-node-rpc-node";

  return nodes.flatMap<ConfigMapSpec>((node) => {
    const base = `${prefix}-${node.index}`;
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
};

const createKubernetesClient = async (): Promise<{
  client: CoreV1Api;
  namespace: string;
}> => {
  const kubeConfig = new KubeConfig();
  try {
    kubeConfig.loadFromCluster();
  } catch (_error) {
    throw new Error(
      "Kubernetes output requires running inside a cluster with service account credentials."
    );
  }

  const namespaceFile = Bun.file(NAMESPACE_PATH);
  let namespace: string;
  try {
    namespace = (await namespaceFile.text()).trim();
  } catch (_error) {
    throw new Error(
      "Unable to determine Kubernetes namespace from service account credentials."
    );
  }

  if (namespace.length === 0) {
    throw new Error("Kubernetes namespace could not be determined.");
  }

  const client = kubeConfig.makeApiClient(CoreV1Api);
  try {
    await client.listNamespacedConfigMap({ namespace, limit: 1 });
  } catch (error) {
    throw new Error(
      `Kubernetes permissions check failed: ${extractKubernetesError(error)}`
    );
  }

  return { client, namespace };
};

const upsertConfigMap = async (
  client: CoreV1Api,
  namespace: string,
  spec: ConfigMapSpec
): Promise<void> => {
  const body: V1ConfigMap = {
    data: { [spec.key]: spec.value },
    metadata: { name: spec.name },
  };

  try {
    await client.createNamespacedConfigMap({ namespace, body });
  } catch (error) {
    if (getStatusCode(error) === HTTP_CONFLICT_STATUS) {
      throw new Error(
        `ConfigMap ${spec.name} already exists. Delete it or choose a different output target.`
      );
    }

    throw new Error(
      `Failed to create ConfigMap ${spec.name}: ${extractKubernetesError(error)}`
    );
  }
};

const extractKubernetesError = (error: unknown): string => {
  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    const withMessage = error as { message?: string };
    if (typeof withMessage.message === "string") {
      return withMessage.message;
    }
    const withBody = error as { body?: { message?: string } };
    if (withBody.body?.message) {
      return withBody.body.message;
    }
  }

  return "unknown error";
};

const getStatusCode = (error: unknown): number | undefined => {
  if (!error || typeof error !== "object") {
    return;
  }

  const fromTopLevel = (error as { statusCode?: number }).statusCode;
  if (typeof fromTopLevel === "number") {
    return fromTopLevel;
  }

  const topLevelStatus = (error as { status?: number }).status;
  if (typeof topLevelStatus === "number") {
    return topLevelStatus;
  }

  const fromResponse = (error as { response?: { statusCode?: number } })
    .response;
  if (fromResponse && typeof fromResponse.statusCode === "number") {
    return fromResponse.statusCode;
  }

  if (
    fromResponse &&
    typeof (fromResponse as { status?: number }).status === "number"
  ) {
    return (fromResponse as { status?: number }).status;
  }

  return;
};

const outputResult = async (
  type: OutputType,
  payload: OutputPayload
): Promise<void> => {
  if (type === "screen") {
    outputToScreen(payload);
    return;
  }

  if (type === "file") {
    const directory = await outputToFile(payload);
    process.stdout.write(`Wrote bootstrap artifacts to ${directory}.\n`);
    return;
  }

  if (type === "kubernetes") {
    await outputToKubernetes(payload);
    return;
  }

  const exhaustiveCheck: never = type;
  throw new Error(`Unsupported output type: ${exhaustiveCheck}`);
};

export type { IndexedNode, OutputPayload, OutputType };
export { outputResult, printFaucet, printGenesis, printGroup };
