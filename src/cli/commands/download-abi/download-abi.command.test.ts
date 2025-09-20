import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { V1ConfigMap } from "@kubernetes/client-node";

import {
  ARTIFACT_ANNOTATION_KEY,
  ARTIFACT_VALUES,
} from "../../../constants/artifact-annotations.ts";
import type { KubernetesClient } from "../../integrations/kubernetes/kubernetes.client.ts";
import { downloadAbi } from "./download-abi.command.ts";

let capturedOutput = "";
let originalWrite: typeof process.stdout.write;
let workingDirectory: string;
const EXPECTED_LIMIT = 100;
const RESOURCE_EXPIRED_STATUS = 410;
const RATE_LIMIT_STATUS = 429;
const noopPause = async () => Promise.resolve();

beforeEach(async () => {
  originalWrite = process.stdout.write;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    capturedOutput += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  workingDirectory = await mkdtemp(join(tmpdir(), "download-abi-"));
  capturedOutput = "";
});

afterEach(async () => {
  process.stdout.write = originalWrite;
  await rm(workingDirectory, { recursive: true, force: true });
});

const readToken = (request: Record<string, unknown>): string | undefined => {
  const current = (request as { _continue?: unknown })._continue;
  if (typeof current === "string" && current.length > 0) {
    const legacy = (request as { continue?: unknown }).continue;
    if (legacy !== undefined && legacy !== current) {
      throw new Error(
        `Legacy continue token mismatch: expected ${current}, received ${legacy}`
      );
    }
    return current;
  }
  const legacy = (request as { continue?: unknown }).continue;
  return typeof legacy === "string" && legacy.length > 0 ? legacy : undefined;
};

const createContext = (
  configMaps: readonly V1ConfigMap[]
): KubernetesClient => ({
  namespace: "test-ns",
  client: {
    listNamespacedConfigMap: (request: Record<string, unknown>) => {
      if ((request as { limit?: number }).limit !== EXPECTED_LIMIT) {
        throw new Error(
          `Expected limit ${EXPECTED_LIMIT}, received ${(request as { limit?: number }).limit}`
        );
      }
      if (readToken(request)) {
        return Promise.resolve({ body: { items: [], metadata: {} } });
      }
      return Promise.resolve({
        body: {
          items: configMaps,
          metadata: {},
        },
      });
    },
  } as unknown as KubernetesClient["client"],
});

const createPaginatedContext = (
  pages: readonly (readonly V1ConfigMap[])[],
  tokens: readonly (string | undefined)[]
): KubernetesClient => {
  let callIndex = 0;
  return {
    namespace: "test-ns",
    client: {
      listNamespacedConfigMap: (request: Record<string, unknown>) => {
        if ((request as { limit?: number }).limit !== EXPECTED_LIMIT) {
          throw new Error(
            `Expected limit ${EXPECTED_LIMIT}, received ${(request as { limit?: number }).limit}`
          );
        }
        const expectedToken = tokens[callIndex];
        const providedToken = readToken(request);
        if (providedToken !== expectedToken) {
          throw new Error(
            `Unexpected continue token: expected ${expectedToken}, received ${providedToken}`
          );
        }
        const items = pages[callIndex] ?? [];
        const nextToken = tokens[callIndex + 1];
        callIndex += 1;
        return Promise.resolve({
          body: {
            items,
            metadata: nextToken
              ? { continue: nextToken, _continue: nextToken }
              : {},
          },
        });
      },
    } as unknown as KubernetesClient["client"],
  };
};

describe("downloadAbi", () => {
  test("writes annotated configmaps to disk", async () => {
    const configMap: V1ConfigMap = {
      metadata: {
        name: "abi-sample",
        annotations: {
          [ARTIFACT_ANNOTATION_KEY]: ARTIFACT_VALUES.abi,
        },
      },
      data: {
        "Sample.json": `${JSON.stringify({ name: "Sample" }, null, 2)}\n`,
      },
    };

    await downloadAbi(
      { outputDirectory: workingDirectory },
      {
        createContext: () => Promise.resolve(createContext([configMap])),
        pause: noopPause,
      }
    );

    const filePath = join(workingDirectory, "abi-sample", "Sample.json");
    const contents = await readFile(filePath, "utf8");
    expect(JSON.parse(contents)).toEqual({ name: "Sample" });
    expect(capturedOutput).toContain("Synced 1 ConfigMaps with 1 files");
  });

  test("skips configmaps without ABI annotation", async () => {
    const configMap: V1ConfigMap = {
      metadata: {
        name: "unrelated",
        annotations: {
          [ARTIFACT_ANNOTATION_KEY]: ARTIFACT_VALUES.alloc,
        },
      },
      data: {
        "ignored.json": "{}\n",
      },
    };

    await downloadAbi(
      { outputDirectory: workingDirectory },
      {
        createContext: () => Promise.resolve(createContext([configMap])),
        pause: noopPause,
      }
    );

    const entries = await readdir(workingDirectory);
    expect(entries).toHaveLength(0);
    expect(capturedOutput).toContain("No ABI ConfigMaps found");
  });

  test("fetches all pages when the API provides a continue token", async () => {
    const pageOne: V1ConfigMap = {
      metadata: {
        name: "abi-first",
        annotations: {
          [ARTIFACT_ANNOTATION_KEY]: ARTIFACT_VALUES.abi,
        },
      },
      data: {
        "First.json": "{}\n",
      },
    };
    const pageTwo: V1ConfigMap = {
      metadata: {
        name: "abi-second",
        annotations: {
          [ARTIFACT_ANNOTATION_KEY]: ARTIFACT_VALUES.abi,
        },
      },
      data: {
        "Second.json": "{}\n",
      },
    };

    await downloadAbi(
      { outputDirectory: workingDirectory },
      {
        createContext: () =>
          Promise.resolve(
            createPaginatedContext(
              [[pageOne], [pageTwo]],
              [undefined, "page-2", undefined]
            )
          ),
        pause: noopPause,
      }
    );

    const directories = await readdir(workingDirectory);
    expect(directories.sort()).toEqual(["abi-first", "abi-second"]);
  });

  test("restarts pagination when Kubernetes expires the snapshot", async () => {
    const configMap: V1ConfigMap = {
      metadata: {
        name: "abi-retry",
        annotations: {
          [ARTIFACT_ANNOTATION_KEY]: ARTIFACT_VALUES.abi,
        },
      },
      data: {
        "Retry.json": "{}\n",
      },
    };

    let callCount = 0;
    const context: KubernetesClient = {
      namespace: "test-ns",
      client: {
        listNamespacedConfigMap: (request: Record<string, unknown>) => {
          callCount += 1;
          if ((request as { limit?: number }).limit !== EXPECTED_LIMIT) {
            throw new Error(
              `Expected limit ${EXPECTED_LIMIT}, received ${(request as { limit?: number }).limit}`
            );
          }

          if (callCount === 1) {
            const error = new Error("Expired snapshot") as Error & {
              statusCode?: number;
            };
            error.statusCode = RESOURCE_EXPIRED_STATUS;
            return Promise.reject(error);
          }

          if (readToken(request)) {
            throw new Error(
              "Continue token should not be provided after resnapshot"
            );
          }

          return Promise.resolve({
            body: {
              items: [configMap],
              metadata: {},
            },
          });
        },
      } as unknown as KubernetesClient["client"],
    };

    await downloadAbi(
      { outputDirectory: workingDirectory },
      {
        createContext: () => Promise.resolve(context),
        pause: noopPause,
      }
    );

    const directories = await readdir(workingDirectory);
    expect(directories).toEqual(["abi-retry"]);
    expect(callCount).toBe(2);
  });

  test("retries when the API rate limits requests", async () => {
    const configMap: V1ConfigMap = {
      metadata: {
        name: "abi-throttle",
        annotations: {
          [ARTIFACT_ANNOTATION_KEY]: ARTIFACT_VALUES.abi,
        },
      },
      data: {
        "Throttle.json": "{}\n",
      },
    };

    let callIndex = 0;
    const context: KubernetesClient = {
      namespace: "test-ns",
      client: {
        listNamespacedConfigMap: (request: Record<string, unknown>) => {
          if ((request as { limit?: number }).limit !== EXPECTED_LIMIT) {
            throw new Error(
              `Expected limit ${EXPECTED_LIMIT}, received ${(request as { limit?: number }).limit}`
            );
          }

          callIndex += 1;
          if (callIndex === 1) {
            const error = new Error("Too Many Requests") as Error & {
              statusCode?: number;
            };
            error.statusCode = RATE_LIMIT_STATUS;
            return Promise.reject(error);
          }

          if (readToken(request)) {
            throw new Error("Unexpected continue token on successful retry");
          }

          return Promise.resolve({
            body: {
              items: [configMap],
              metadata: {},
            },
          });
        },
      } as unknown as KubernetesClient["client"],
    };

    await downloadAbi(
      { outputDirectory: workingDirectory },
      {
        createContext: () => Promise.resolve(context),
        pause: noopPause,
      }
    );

    const directories = await readdir(workingDirectory);
    expect(directories).toEqual(["abi-throttle"]);
    expect(callIndex).toBe(2);
  });
});
