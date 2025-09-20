import { stat } from "node:fs/promises";
import { parse } from "node:path";
import { Glob } from "bun";

const JSON_EXTENSION = ".json";
const ABI_CONFIGMAP_PREFIX = "abi-";
const ABI_GLOB = new Glob("**/*");

type AbiArtifact = {
  configMapName: string;
  fileName: string;
  contents: string;
};

const normalizeConfigMapName = (fileName: string): string => {
  const { name } = parse(fileName);
  const normalized = name.trim().toLowerCase();
  if (normalized.length === 0) {
    throw new Error(
      "ABI filenames must contain at least one alphanumeric character."
    );
  }
  return `${ABI_CONFIGMAP_PREFIX}${normalized}`;
};

const loadAbis = async (directory: string): Promise<AbiArtifact[]> => {
  const trimmedDirectory = directory.trim();
  if (trimmedDirectory.length === 0) {
    throw new Error("ABI directory must be provided.");
  }

  const directoryStats = await stat(trimmedDirectory).catch(() => null);
  if (!directoryStats) {
    throw new Error(`ABI directory not found at ${directory}`);
  }
  if (!directoryStats.isDirectory()) {
    throw new Error(`ABI path must be a directory. Received ${directory}`);
  }

  const matchedFiles: string[] = [];
  for await (const filePath of ABI_GLOB.scan({
    cwd: trimmedDirectory,
    absolute: true,
    onlyFiles: true,
  })) {
    if (!filePath.toLowerCase().endsWith(JSON_EXTENSION)) {
      continue;
    }
    matchedFiles.push(filePath);
  }

  if (matchedFiles.length === 0) {
    return [];
  }

  const artifacts: AbiArtifact[] = [];
  for (const absolutePath of matchedFiles) {
    const fileName = parse(absolutePath).base;
    const configMapName = normalizeConfigMapName(fileName);

    try {
      const parsed = await Bun.file(absolutePath).json();
      artifacts.push({
        configMapName,
        fileName,
        contents: `${JSON.stringify(parsed, null, 2)}\n`,
      });
    } catch (error) {
      throw new Error(
        `ABI file ${fileName} is not valid JSON: ${(error as Error).message}`
      );
    }
  }

  artifacts.sort((left, right) =>
    left.configMapName.localeCompare(right.configMapName)
  );

  return artifacts;
};

export type { AbiArtifact };
export { loadAbis };
