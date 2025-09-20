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

const createContext = (
  configMaps: readonly V1ConfigMap[]
): KubernetesClient => ({
  namespace: "test-ns",
  client: {
    listNamespacedConfigMap: (request: {
      namespace: string;
      limit?: number;
      continue?: string;
    }) => {
      if (request.continue) {
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
      listNamespacedConfigMap: (request: {
        namespace: string;
        limit?: number;
        continue?: string;
      }) => {
        const expectedToken = tokens[callIndex];
        const providedToken = request.continue ?? undefined;
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
            metadata: nextToken ? { continue: nextToken } : {},
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
      { createContext: () => Promise.resolve(createContext([configMap])) }
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
      { createContext: () => Promise.resolve(createContext([configMap])) }
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
      }
    );

    const directories = await readdir(workingDirectory);
    expect(directories.sort()).toEqual(["abi-first", "abi-second"]);
  });
});
