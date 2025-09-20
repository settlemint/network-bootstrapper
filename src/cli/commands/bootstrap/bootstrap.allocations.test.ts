import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getAddress } from "viem";

import { loadAllocations } from "./bootstrap.allocations.ts";

const INVALID_JSON_ERROR = /Allocations file is not valid JSON/;
const INVALID_ADDRESS_ERROR = /Invalid address/;
const INVALID_EXTENSION_ERROR = /Allocations file must be a \.json file/;
const MISSING_FILE_ERROR = /Allocations file not found/;

describe("loadAllocations", () => {
  const createTempFile = (content: string) => {
    const dir = mkdtempSync(join(tmpdir(), "alloc-test-"));
    const path = join(dir, "alloc.json");
    Bun.write(path, content);
    return { dir, path };
  };

  test("parses valid allocations", async () => {
    const allocations = {
      "0x0000000000000000000000000000000000000001": {
        balance: "0x01",
        storage: {
          "0x00": "0x01",
        },
      },
    };
    const { dir, path } = createTempFile(JSON.stringify(allocations));

    const result = await loadAllocations(path);

    expect(
      result[getAddress("0x0000000000000000000000000000000000000001")]
    ).toEqual({
      balance: "0x01",
      code: undefined,
      storage: {
        "0x00": "0x01",
      },
    });

    rmSync(dir, { recursive: true, force: true });
  });

  test("throws on invalid json", async () => {
    const { dir, path } = createTempFile("not json");

    await expect(loadAllocations(path)).rejects.toThrow(INVALID_JSON_ERROR);

    rmSync(dir, { recursive: true, force: true });
  });

  test("throws on invalid address", async () => {
    const allocations = { INVALID: { balance: "0x01" } };
    const { dir, path } = createTempFile(JSON.stringify(allocations));

    await expect(loadAllocations(path)).rejects.toThrow(INVALID_ADDRESS_ERROR);

    rmSync(dir, { recursive: true, force: true });
  });

  test("throws on non-json extension", async () => {
    const dir = mkdtempSync(join(tmpdir(), "alloc-test-"));
    const path = join(dir, "alloc.txt");
    Bun.write(path, "{}");

    await expect(loadAllocations(path)).rejects.toThrow(
      INVALID_EXTENSION_ERROR
    );

    rmSync(dir, { recursive: true, force: true });
  });

  test("throws when file missing", async () => {
    await expect(loadAllocations("/tmp/does-not-exist.json")).rejects.toThrow(
      MISSING_FILE_ERROR
    );
  });
});
