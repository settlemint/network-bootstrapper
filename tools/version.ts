#!/usr/bin/env bun

import { appendFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Glob } from "bun";
import { parse, stringify } from "yaml";

const RELEASE_TAG_PATTERN = /^v?[0-9]+\.[0-9]+\.[0-9]+$/;
const LEADING_V_PATTERN = /^v/;
const NON_ALPHANUMERIC_PATTERN = /[^0-9A-Za-z-]/g;

const sanitizeIdentifier = (value: string) =>
  value.replace(NON_ALPHANUMERIC_PATTERN, "");

type VersionInfo = {
  tag: "latest" | "main" | "pr";
  version: string;
};

type VersionParams = {
  refSlug?: string;
  refName?: string;
  buildId?: string;
  startPath?: string;
};

type PackageJson = {
  version: string;
  [key: string]: unknown;
};

type ChartYaml = {
  version: string;
  appVersion: string;
  dependencies?: Array<{
    name: string;
    version: string;
    repository?: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

type UpdateResult = {
  changed: boolean;
  logs?: string[];
};

const toPosixPath = (value: string): string => value.replaceAll("\\", "/");

async function scanFiles(
  pattern: string,
  exclude: string[],
  cwd: string
): Promise<string[]> {
  const glob = new Glob(pattern);
  const files: string[] = [];

  for await (const file of glob.scan(cwd)) {
    const normalized = toPosixPath(file);
    if (exclude.some((entry) => normalized.includes(entry))) {
      continue;
    }
    files.push(file);
  }

  return files;
}

async function processFile<T>({
  filePath,
  read,
  update,
  write,
}: {
  filePath: string;
  read: (raw: string) => T;
  update: (data: T, filePath: string) => UpdateResult;
  write: (data: T) => string;
}): Promise<boolean> {
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    console.warn(`    Skipping: ${filePath} does not exist`);
    return false;
  }

  const raw = await file.text();
  const data = read(raw);
  const { changed, logs } = update(data, filePath);

  if (!changed) {
    console.log("    No changes needed");
    return false;
  }

  await Bun.write(filePath, write(data));
  if (logs?.length) {
    for (const line of logs) {
      console.log(`    ${line}`);
    }
  }
  console.log(`    ✔ ${filePath}`);
  return true;
}

async function findPackageJsonPath(startPath?: string): Promise<string> {
  const resolvedPath = resolve(startPath ?? ".");
  let currentDir = resolvedPath;
  let parentDir = dirname(currentDir);

  while (currentDir !== parentDir) {
    const candidate = join(currentDir, "package.json");
    if (await Bun.file(candidate).exists()) {
      return candidate;
    }

    currentDir = parentDir;
    parentDir = dirname(currentDir);
  }

  const rootCandidate = join(currentDir, "package.json");
  if (await Bun.file(rootCandidate).exists()) {
    return rootCandidate;
  }

  throw new Error(`package.json not found when searching from ${resolvedPath}`);
}

/**
 * Reads and parses the root package.json file
 * @param startPath - Starting path for finding the monorepo root
 * @returns The parsed package.json content
 */
async function readRootPackageJson(startPath?: string): Promise<PackageJson> {
  const packageJsonPath = await findPackageJsonPath(startPath);
  const packageJsonFile = Bun.file(packageJsonPath);

  const packageJson = (await packageJsonFile.json()) as PackageJson;

  if (!packageJson.version) {
    throw new Error(`No version found in ${packageJsonPath}`);
  }

  return packageJson;
}

/**
 * Generates version string based on Git ref information and base version
 * @param refSlug - Git ref slug
 * @param refName - Git ref name
 * @param baseVersion - Base version from package.json
 * @param buildId - Optional build identifier (GitHub run counter or similar)
 * @returns Object containing version and tag
 */
function generateVersionInfo(
  refSlug: string,
  refName: string,
  baseVersion: string,
  buildId?: string
): VersionInfo {
  if (RELEASE_TAG_PATTERN.test(refSlug)) {
    // Remove 'v' prefix if present
    const version = refSlug.replace(LEADING_V_PATTERN, "");
    return {
      tag: "latest",
      version,
    };
  }

  if (refName === "main") {
    // Prefer numeric/strict BUILD_ID (or GitHub run counters) for Renovate sorting
    // Fall back to a timestamp to ensure uniqueness outside CI
    const id = sanitizeIdentifier(buildId || "") || `${Date.now()}`;
    // Use SemVer pre-release with dot-separated identifiers: -main.<buildid>
    const version = `${baseVersion}-main.${id}`;
    return {
      tag: "main",
      version,
    };
  }

  // Default case (PR or other branches)
  const identifier = sanitizeIdentifier(buildId || "") || `${Date.now()}`;
  const version = `${baseVersion}-pr.${identifier}`;
  return {
    tag: "pr",
    version,
  };
}

/**
 * Gets version and tag information based on Git ref information
 * @param params - Configuration object with Git ref information
 * @returns Object containing version and tag
 */
export async function getVersionInfo(
  params: VersionParams = {}
): Promise<VersionInfo> {
  const {
    refSlug = process.env.GITHUB_REF_SLUG || "",
    refName = process.env.GITHUB_REF_NAME || "",
    buildId: providedBuildId,
    startPath,
  } = params;

  const buildId =
    providedBuildId ||
    process.env.BUILD_ID ||
    process.env.GITHUB_RUN_NUMBER ||
    process.env.GITHUB_RUN_ID ||
    "";

  const packageJson = await readRootPackageJson(startPath);

  return generateVersionInfo(refSlug, refName, packageJson.version, buildId);
}

/**
 * Gets version info and logs the result (useful for CI/CD)
 * @param params - Configuration object with Git ref information
 * @returns Object containing version and tag with console output
 */
export async function getVersionInfoWithLogging(
  params: VersionParams = {}
): Promise<VersionInfo> {
  const result = await getVersionInfo(params);

  console.log(`TAG=${result.tag}`);
  console.log(`VERSION=${result.version}`);

  return result;
}

/**
 * Updates workspace dependencies in a dependencies object
 * @param deps - Dependencies object to update
 * @param depType - Type of dependencies (for logging)
 * @param newVersion - New version to use
 * @returns Number of workspace dependencies updated
 */
function updateWorkspaceDependencies(
  deps: Record<string, string> | undefined,
  depType: string,
  newVersion: string
): number {
  if (!deps) {
    return 0;
  }

  let workspaceCount = 0;
  for (const [depName, depVersion] of Object.entries(deps)) {
    // Skip @atk/* packages - not published to npm
    if (depVersion === "workspace:*" && !depName.startsWith("@atk/")) {
      deps[depName] = newVersion;
      workspaceCount++;
    }
  }

  if (workspaceCount > 0) {
    console.log(
      `    Updated ${workspaceCount} workspace:* references in ${depType}`
    );
  }

  return workspaceCount;
}

/**
 * Updates chart dependencies with version "*"
 * @param dependencies - Chart dependencies array to update
 * @param newVersion - New version to use
 * @returns Number of chart dependencies updated
 */
function updateChartDependencies(
  dependencies:
    | Array<{
        name: string;
        version: string;
        repository?: string;
        [key: string]: unknown;
      }>
    | undefined
): number {
  if (!dependencies) {
    return 0;
  }

  let dependencyCount = 0;
  for (const dep of dependencies) {
    if (dep.version !== "*") {
      dep.version = "*";
      dependencyCount++;
    }
  }

  return dependencyCount;
}

/**
 * Updates all package.json files in the workspace with the new version using glob pattern
 * Also replaces "workspace:*" references with the actual version
 * @param startPath - Starting path for finding package.json files (defaults to current working directory)
 * @returns Promise that resolves when all updates are complete
 */
export async function updatePackageVersion(
  startPath?: string,
  versionInfoOverride?: VersionInfo
): Promise<void> {
  try {
    // Get the current version info
    const versionInfo =
      versionInfoOverride ?? (await getVersionInfo({ startPath }));
    const newVersion = versionInfo.version;

    console.log(`Updating all package.json files to version: ${newVersion}`);
    const cwd = resolve(startPath ?? ".");
    const packageFiles = await scanFiles(
      "**/package.json",
      ["node_modules/", "kit/contracts/dependencies/"],
      cwd
    );

    if (packageFiles.length === 0) {
      console.warn("No package.json files found");
      return;
    }

    console.log(`Found ${packageFiles.length} package.json files:`);

    let updatedCount = 0;

    for (const packagePath of packageFiles) {
      try {
        console.log(`  Processing: ${packagePath}`);

        const changed = await processFile<PackageJson>({
          filePath: packagePath,
          read: (raw) => JSON.parse(raw) as PackageJson,
          update: (packageJson) => {
            if (!packageJson.version) {
              console.warn("    Skipping: No version field found");
              return { changed: false };
            }

            const logs: string[] = [];
            const oldVersion = packageJson.version;
            const versionChanged = oldVersion !== newVersion;

            if (versionChanged) {
              packageJson.version = newVersion;
              logs.push(`Updated version: ${oldVersion} -> ${newVersion}`);
            }

            const workspaceUpdates = [
              updateWorkspaceDependencies(
                packageJson.dependencies as Record<string, string>,
                "dependencies",
                newVersion
              ),
              updateWorkspaceDependencies(
                packageJson.devDependencies as Record<string, string>,
                "devDependencies",
                newVersion
              ),
              updateWorkspaceDependencies(
                packageJson.peerDependencies as Record<string, string>,
                "peerDependencies",
                newVersion
              ),
              updateWorkspaceDependencies(
                packageJson.optionalDependencies as Record<string, string>,
                "optionalDependencies",
                newVersion
              ),
            ];

            const totalWorkspaceUpdates = workspaceUpdates.reduce(
              (sum, count) => sum + count,
              0
            );

            if (totalWorkspaceUpdates > 0) {
              logs.push(
                `Updated ${totalWorkspaceUpdates} workspace:* reference${
                  totalWorkspaceUpdates === 1 ? "" : "s"
                }`
              );
            }

            return {
              changed: versionChanged || totalWorkspaceUpdates > 0,
              logs,
            };
          },
          write: (packageJson) => `${JSON.stringify(packageJson, null, 2)}\n`,
        });

        if (changed) {
          updatedCount++;
        }
      } catch (err) {
        console.error(`    Error processing ${packagePath}:`, err);
      }
    }

    console.log(`\nSuccessfully updated ${updatedCount} package.json files`);
  } catch (err) {
    console.error("Failed to update package versions:", err);
    process.exit(1);
  }
}

/**
 * Updates all Chart.yaml files in the ATK directory with the current version
 */
async function updateChartVersions(
  versionInfoOverride?: VersionInfo
): Promise<void> {
  try {
    // Get the current version info
    const versionInfo = versionInfoOverride ?? (await getVersionInfo());
    const newVersion = versionInfo.version;

    console.log(`Updating charts to version: ${newVersion}`);

    const chartFiles = await scanFiles(
      "charts/**/Chart.yaml",
      [],
      process.cwd()
    );

    if (chartFiles.length === 0) {
      console.warn("No Chart.yaml files found in charts/");
      return;
    }

    console.log(`Found ${chartFiles.length} Chart.yaml files:`);

    let updatedCount = 0;

    for (const chartPath of chartFiles) {
      try {
        const changed = await processFile<ChartYaml>({
          filePath: chartPath,
          read: (raw) => parse(raw) as ChartYaml,
          update: (chart) => {
            if (!(chart.version || chart.appVersion)) {
              console.warn(
                "    Skipping: No version or appVersion fields found"
              );
              return { changed: false };
            }

            const logs: string[] = [];
            const versionChanged =
              typeof chart.version === "string" && chart.version !== newVersion;
            const appVersionChanged =
              typeof chart.appVersion === "string" &&
              chart.appVersion !== newVersion;

            if (versionChanged) {
              logs.push(`Updated version: ${chart.version} -> ${newVersion}`);
              chart.version = newVersion;
            }
            if (appVersionChanged) {
              logs.push(
                `Updated appVersion: ${chart.appVersion} -> ${newVersion}`
              );
              chart.appVersion = newVersion;
            }

            const dependencyUpdates = updateChartDependencies(
              chart.dependencies
            );

            if (dependencyUpdates > 0) {
              logs.push(
                `Set ${dependencyUpdates} chart dependenc${
                  dependencyUpdates === 1 ? "y" : "ies"
                } to "*"`
              );
            }

            return {
              changed:
                versionChanged || appVersionChanged || dependencyUpdates > 0,
              logs,
            };
          },
          write: (chart) => `${stringify(chart)}\n`,
        });

        if (changed) {
          updatedCount++;
        }
      } catch (err) {
        console.error(`    Error processing ${chartPath}:`, err);
      }
    }

    console.log(`\nSuccessfully updated ${updatedCount} Chart.yaml files`);
  } catch (err) {
    console.error("Failed to update chart versions:", err);
    process.exit(1);
  }
}

/**
 * Exports version and tag information to GitHub Outputs/Env for downstream steps
 */
async function persistGithubContext(versionInfo: VersionInfo): Promise<void> {
  const { version, tag } = versionInfo;

  const appendLines = async (
    filePath: string | undefined,
    lines: string[]
  ): Promise<void> => {
    if (!filePath || lines.length === 0) {
      return;
    }

    const content = `${lines.join("\n")}\n`;
    await appendFile(filePath, content, "utf8");
  };

  await appendLines(process.env.GITHUB_OUTPUT, [
    `version=${version}`,
    `tag=${tag}`,
  ]);

  await appendLines(process.env.GITHUB_ENV, [
    `NETWORK_BOOTSTRAPPER_VERSION=${version}`,
    `NETWORK_BOOTSTRAPPER_TAG=${tag}`,
  ]);
}

// Run the script if called directly
if (import.meta.main) {
  const args = new Set(Bun.argv.slice(2));
  const allowLocal = args.has("--allow-local") || args.has("--force");

  // Check if running in CI environment unless explicitly overridden
  if (!(process.env.CI || allowLocal)) {
    console.log(
      "Set the CI environment variable or rerun with --allow-local to execute this script."
    );
    process.exit(0);
  }

  const versionInfo = await getVersionInfo();

  await updateChartVersions(versionInfo);
  await updatePackageVersion(undefined, versionInfo);
  await persistGithubContext(versionInfo);
}
