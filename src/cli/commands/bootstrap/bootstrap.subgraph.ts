import { CID } from "multiformats/cid";

const SUBGRAPH_HASH_KEY = "SUBGRAPH_HASH" as const;

const loadSubgraphHash = async (path: string): Promise<string> => {
  const trimmedPath = path.trim();
  if (trimmedPath.length === 0) {
    throw new Error("Subgraph hash file path must be provided.");
  }

  const file = Bun.file(trimmedPath);
  if (!(await file.exists())) {
    throw new Error(`Subgraph hash file not found at ${path}`);
  }

  const contents = (await file.text()).trim();
  if (contents.length === 0) {
    throw new Error("Subgraph hash file is empty.");
  }

  try {
    CID.parse(contents);
  } catch (error) {
    throw new Error(
      `Subgraph hash is not a valid IPFS hash: ${(error as Error).message}`
    );
  }

  return contents;
};

export { loadSubgraphHash, SUBGRAPH_HASH_KEY };
