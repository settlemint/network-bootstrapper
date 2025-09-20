import {
  CoreV1Api,
  KubeConfig,
  type V1ConfigMap,
  type V1Secret,
} from "@kubernetes/client-node";

const NAMESPACE_PATH =
  "/var/run/secrets/kubernetes.io/serviceaccount/namespace";
const HEX_PREFIX = "0x";
const HTTP_CONFLICT_STATUS = 409;
const HTTP_NOT_FOUND_STATUS = 404;
const STATUS_CODE_PATTERN = /\b(\d{3})\b/u;
const HTTP_CODE_MESSAGE_PATTERN = /HTTP-Code:\s*(\d{3})/u;

type KubernetesClient = {
  client: CoreV1Api;
  namespace: string;
};

type ConfigMapEntrySpec = {
  key: string;
  name: string;
  value: string;
  immutable?: boolean;
  onConflict?: "throw" | "skip";
  annotations?: Record<string, string>;
};

type SecretEntrySpec = {
  key: string;
  name: string;
  value: string;
  type?: string;
  onConflict?: "throw" | "skip";
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

  const body = (
    error as {
      body?: {
        status?: number;
        statusCode?: number;
        code?: number;
        message?: string;
      };
    }
  ).body;
  if (body) {
    if (typeof body.status === "number") {
      return body.status;
    }
    if (typeof body.statusCode === "number") {
      return body.statusCode;
    }
    if (typeof body.code === "number") {
      return body.code;
    }
    if (typeof body.message === "string") {
      const match = body.message.match(STATUS_CODE_PATTERN);
      if (match) {
        const parsed = Number.parseInt(match[1] ?? "", 10);
        if (!Number.isNaN(parsed)) {
          return parsed;
        }
      }
    }
  }

  const message = (error as { message?: string }).message;
  if (typeof message === "string") {
    const match = message.match(HTTP_CODE_MESSAGE_PATTERN);
    if (match) {
      const parsed = Number.parseInt(match[1] ?? "", 10);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }

  return;
};

const createKubernetesClient = async (): Promise<KubernetesClient> => {
  Bun.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
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
    await Promise.all([
      client.listNamespacedConfigMap({ namespace, limit: 1 }),
      client.listNamespacedSecret({ namespace, limit: 1 }),
    ]);
  } catch (error) {
    throw new Error(
      `Kubernetes permissions check failed: ${extractKubernetesError(error)}`
    );
  }

  return { client, namespace };
};

const toAllocationConfigMapName = (address: string): string => {
  const normalized = address.startsWith(HEX_PREFIX)
    ? address.slice(2).toLowerCase()
    : address.toLowerCase();
  return `alloc-${normalized}`;
};

const unwrapConfigMap = (payload: unknown): V1ConfigMap | undefined => {
  if (!payload || typeof payload !== "object") {
    return;
  }

  if ("data" in payload || "metadata" in payload) {
    return payload as V1ConfigMap;
  }

  if ("body" in payload) {
    const { body } = payload as { body?: V1ConfigMap };
    if (body) {
      return body;
    }
  }

  return;
};

const createConfigMap = async (
  context: KubernetesClient,
  spec: ConfigMapEntrySpec
): Promise<boolean> => {
  const body: V1ConfigMap = {
    data: { [spec.key]: spec.value },
    immutable: spec.immutable,
    metadata: {
      name: spec.name,
      annotations: spec.annotations,
    },
  };

  try {
    await context.client.createNamespacedConfigMap({
      namespace: context.namespace,
      body,
    });
    return true;
  } catch (error) {
    if (getStatusCode(error) === HTTP_CONFLICT_STATUS) {
      if (spec.onConflict === "skip") {
        process.stdout.write(
          `ConfigMap ${spec.name} already exists, skipping creation.\n`
        );
        return false;
      }
      throw new Error(
        `ConfigMap ${spec.name} already exists. Delete it or choose a different output target.`
      );
    }

    throw new Error(
      `Failed to create ConfigMap ${spec.name}: ${extractKubernetesError(error)}`
    );
  }
};

const createSecret = async (
  context: KubernetesClient,
  spec: SecretEntrySpec
): Promise<boolean> => {
  const body: V1Secret = {
    metadata: { name: spec.name },
    stringData: { [spec.key]: spec.value },
    type: spec.type ?? "Opaque",
  };

  try {
    await context.client.createNamespacedSecret({
      namespace: context.namespace,
      body,
    });
    return true;
  } catch (error) {
    if (getStatusCode(error) === HTTP_CONFLICT_STATUS) {
      if (spec.onConflict === "skip") {
        process.stdout.write(
          `Secret ${spec.name} already exists, skipping creation.\n`
        );
        return false;
      }
      throw new Error(
        `Secret ${spec.name} already exists. Delete it or choose a different output target.`
      );
    }

    throw new Error(
      `Failed to create Secret ${spec.name}: ${extractKubernetesError(error)}`
    );
  }
};

const readConfigMap = async (
  context: KubernetesClient,
  name: string
): Promise<V1ConfigMap | undefined> => {
  try {
    const response = await context.client.readNamespacedConfigMap({
      name,
      namespace: context.namespace,
    });
    return unwrapConfigMap(response);
  } catch (error) {
    if (getStatusCode(error) === HTTP_NOT_FOUND_STATUS) {
      return;
    }

    throw new Error(
      `Failed to read ConfigMap ${name}: ${extractKubernetesError(error)}`
    );
  }
};

export type { ConfigMapEntrySpec, KubernetesClient, SecretEntrySpec };
export {
  createConfigMap,
  createKubernetesClient,
  createSecret,
  extractKubernetesError,
  getStatusCode,
  readConfigMap,
  toAllocationConfigMapName,
};
