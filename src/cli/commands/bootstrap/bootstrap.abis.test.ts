import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadAbis } from "./bootstrap.abis.ts";

let workingDirectory: string;

const MISSING_DIRECTORY_REGEX = /ABI directory not found/u;
const BROKEN_FILE_REGEX = /ABI file Broken\.json is not valid JSON/u;

beforeEach(async () => {
  workingDirectory = await mkdtemp(join(tmpdir(), "abis-"));
});

afterEach(async () => {
  await rm(workingDirectory, { recursive: true, force: true });
});

describe("loadAbis", () => {
  test("reads json files and normalizes configmap names", async () => {
    const firstAbi = join(workingDirectory, "Token.json");
    const secondAbi = join(workingDirectory, "vault.ABI.JSON");
    await writeFile(firstAbi, JSON.stringify({ name: "Token" }));
    await writeFile(secondAbi, JSON.stringify({ name: "Vault" }));

    const abis = await loadAbis(workingDirectory);

    expect(abis).toEqual([
      {
        configMapName: "abi-token",
        fileName: "Token.json",
        contents: `${JSON.stringify({ name: "Token" }, null, 2)}\n`,
      },
      {
        configMapName: "abi-vault.abi",
        fileName: "vault.ABI.JSON",
        contents: `${JSON.stringify({ name: "Vault" }, null, 2)}\n`,
      },
    ]);
  });

  test("recursively reads json files", async () => {
    const nestedDirectory = join(workingDirectory, "nested");
    await mkdir(nestedDirectory, { recursive: true });
    await writeFile(
      join(nestedDirectory, "Nested.json"),
      JSON.stringify({ name: "Nested" })
    );

    const abis = await loadAbis(workingDirectory);

    expect(abis).toContainEqual({
      configMapName: "abi-nested",
      fileName: "Nested.json",
      contents: `${JSON.stringify({ name: "Nested" }, null, 2)}\n`,
    });
  });

  test("ignores non-json files", async () => {
    await writeFile(join(workingDirectory, "README.md"), "# readme");

    const abis = await loadAbis(workingDirectory);
    expect(abis).toHaveLength(0);
  });

  test("throws when directory is missing", async () => {
    await expect(loadAbis(join(workingDirectory, "missing"))).rejects.toThrow(
      MISSING_DIRECTORY_REGEX
    );
  });

  test("throws when file payload is invalid json", async () => {
    await writeFile(join(workingDirectory, "Broken.json"), "not json");

    await expect(loadAbis(workingDirectory)).rejects.toThrow(BROKEN_FILE_REGEX);
  });
});
