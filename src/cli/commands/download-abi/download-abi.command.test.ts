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
    listNamespacedConfigMap: ({
      _continue,
    }: {
      namespace: string;
      limit?: number;
      _continue?: string;
    }) => {
      if (_continue) {
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
});
