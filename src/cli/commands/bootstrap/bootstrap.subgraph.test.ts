import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { loadSubgraphHash } from "./bootstrap.subgraph.ts";

const TMP_DIR = join(process.cwd(), "tmp-subgraph-tests");
const writeTempFile = async (
  name: string,
  contents: string
): Promise<string> => {
  await mkdir(TMP_DIR, { recursive: true });
  const path = join(TMP_DIR, name);
  await Bun.write(path, contents);
  return path;
};

afterEach(async () => {
  await rm(TMP_DIR, { recursive: true, force: true });
});

describe("loadSubgraphHash", () => {
  test("reads and validates CID values", async () => {
    const cid = "bafybeigdyrztzd4gufq2bdsd6we3jh7uzulnd2ipkyli5sto6f5j6rlude";
    const path = await writeTempFile("hash.txt", `${cid}\n`);

    const loaded = await loadSubgraphHash(path);

    expect(loaded).toBe(cid);
  });

  test("throws when file does not exist", async () => {
    await expect(
      loadSubgraphHash(join(TMP_DIR, "missing.txt"))
    ).rejects.toThrow("Subgraph hash file not found");
  });

  test("throws when file is empty", async () => {
    const path = await writeTempFile("empty.txt", "   \n\t  ");

    await expect(loadSubgraphHash(path)).rejects.toThrow(
      "Subgraph hash file is empty."
    );
  });

  test("throws when contents are not a valid CID", async () => {
    const path = await writeTempFile("invalid.txt", "not-a-cid");

    await expect(loadSubgraphHash(path)).rejects.toThrow(
      "Subgraph hash is not a valid IPFS hash"
    );
  });
});
