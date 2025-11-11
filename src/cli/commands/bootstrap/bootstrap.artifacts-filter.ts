type ArtifactKind = "genesis" | "keys" | "abis" | "subgraph" | "allocations";

type ArtifactFilter = {
  genesis: boolean;
  keys: boolean;
  abis: boolean;
  subgraph: boolean;
  allocations: boolean;
};

const ALL_ARTIFACT_KINDS: ArtifactKind[] = [
  "genesis",
  "keys",
  "abis",
  "subgraph",
  "allocations",
];

const DEFAULT_ARTIFACT_FILTER: ArtifactFilter = {
  genesis: true,
  keys: true,
  abis: true,
  subgraph: true,
  allocations: true,
};

const parseArtifactList = (input: string): ArtifactFilter => {
  const filter = { ...DEFAULT_ARTIFACT_FILTER };

  if (!input || input.trim().length === 0) {
    return filter;
  }

  const items = input
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);

  // If items are provided, start with all false and enable only selected ones
  const selectedFilter: ArtifactFilter = {
    genesis: false,
    keys: false,
    abis: false,
    subgraph: false,
    allocations: false,
  };

  for (const item of items) {
    if (!ALL_ARTIFACT_KINDS.includes(item as ArtifactKind)) {
      throw new Error(
        `Invalid artifact kind: "${item}". Must be one of: ${ALL_ARTIFACT_KINDS.join(", ")}`
      );
    }
    selectedFilter[item as ArtifactKind] = true;
  }

  return selectedFilter;
};

const includesArtifact = (
  filter: ArtifactFilter,
  kind: ArtifactKind
): boolean => filter[kind];

export type { ArtifactKind, ArtifactFilter };
export {
  ALL_ARTIFACT_KINDS,
  DEFAULT_ARTIFACT_FILTER,
  parseArtifactList,
  includesArtifact,
};
