#!/usr/bin/env bun

import { dirname, join, relative, resolve } from "node:path";
import { Glob } from "bun";
import { parse, stringify } from "yaml";

const RELEASE_TAG_PATTERN = /^v?[0-9]+\.[0-9]+\.[0-9]+$/;
const LEADING_V_PATTERN = /^v/;
const NON_ALPHANUMERIC_PATTERN = /[^0-9A-Za-z-]/g;

type VersionInfo = {
  tag: "latest" | "main" | "pr";
  version: string;
};

type VersionParams = {
  refSlug?: string;
  refName?: string;
  shaShort?: string;
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
 * @param shaShort - Short SHA
 * @param baseVersion - Base version from package.json
 * @returns Object containing version and tag
 */
function generateVersionInfo(
  refSlug: string,
  refName: string,
  shaShort: string,
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
    // Prefer numeric/strict BUILD_ID for better Renovate sorting
    // Fallback to short SHA, and finally a timestamp to ensure uniqueness
    const sanitize = (value: string) =>
      value.replace(NON_ALPHANUMERIC_PATTERN, "");
    const id =
      sanitize(buildId || "") || sanitize(shaShort || "") || `${Date.now()}`;
    // Use SemVer pre-release with dot-separated identifiers: -main.<buildid>
    const version = `${baseVersion}-main.${id}`;
    return {
      tag: "main",
      version,
    };
  }

  // Default case (PR or other branches)
  const version = `${baseVersion}-pr${shaShort.replace(LEADING_V_PATTERN, "")}`;
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
    shaShort = process.env.GITHUB_SHA_SHORT || "",
    buildId = process.env.BUILD_ID || "",
    startPath,
  } = params;

  const packageJson = await readRootPackageJson(startPath);

  return generateVersionInfo(
    refSlug,
    refName,
    shaShort,
    packageJson.version,
    buildId
  );
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
    | Array<{ name: string; version: string; [key: string]: unknown }>
    | undefined,
  newVersion: string
): number {
  if (!dependencies) {
    return 0;
  }

  let dependencyCount = 0;
  for (const dep of dependencies) {
    if (dep.version === "*") {
      dep.version = newVersion;
      dependencyCount++;
    }
  }

  if (dependencyCount > 0) {
    console.log(
      `    Updated ${dependencyCount} "*" version references in chart dependencies`
    );
  }

  return dependencyCount;
}

/**
 * Updates all package.json files in the workspace with the new version using glob pattern
 * Also replaces "workspace:*" references with the actual version
 * @param startPath - Starting path for finding package.json files (defaults to current working directory)
 * @returns Promise that resolves when all updates are complete
 */
export async function updatePackageVersion(startPath?: string): Promise<void> {
  try {
    // Get the current version info
    const versionInfo = await getVersionInfo({ startPath });
    const newVersion = versionInfo.version;

    console.log(`Updating all package.json files to version: ${newVersion}`);

    // Find all package.json files in the workspace, excluding node_modules
    const glob = new Glob("**/package.json");
    const packageFiles: string[] = [];

    for await (const file of glob.scan(startPath || ".")) {
      // Skip files in node_modules and kit/contracts/dependencies directories
      if (
        file.includes("node_modules/") ||
        file.includes("kit/contracts/dependencies/")
      ) {
        continue;
      }
      packageFiles.push(file);
    }

    if (packageFiles.length === 0) {
      console.warn("No package.json files found");
      return;
    }

    console.log(`Found ${packageFiles.length} package.json files:`);

    let updatedCount = 0;

    for (const packagePath of packageFiles) {
      try {
        console.log(`  Processing: ${packagePath}`);

        // Read the current package.json file
        const packageJsonFile = Bun.file(packagePath);
        if (!(await packageJsonFile.exists())) {
          console.warn("    Skipping: File does not exist");
          continue;
        }

        const packageJson = (await packageJsonFile.json()) as PackageJson;

        if (!packageJson.version) {
          console.warn("    Skipping: No version field found");
          continue;
        }

        const oldVersion = packageJson.version;
        const versionChanged = oldVersion !== newVersion;

        if (versionChanged) {
          packageJson.version = newVersion;
        }

        // Update workspace dependencies in all dependency types
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

        const shouldWrite = versionChanged || totalWorkspaceUpdates > 0;

        if (shouldWrite) {
          // Write the updated package.json back to disk
          await Bun.write(
            packagePath,
            `${JSON.stringify(packageJson, null, 2)}\n`
          );

          if (versionChanged) {
            console.log(`    Updated version: ${oldVersion} -> ${newVersion}`);
          } else {
            console.log(`    Version already at ${newVersion}`);
          }
          if (totalWorkspaceUpdates > 0) {
            console.log(
              `    Updated ${totalWorkspaceUpdates} total workspace:* references`
            );
          }
          updatedCount++;
        } else {
          console.log("    No changes needed");
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
async function updateChartVersions(): Promise<void> {
  try {
    // Get the current version info
    const versionInfo = await getVersionInfo();
    const newVersion = versionInfo.version;

    console.log(`Updating charts to version: ${newVersion}`);

    // Find all Chart.yaml files in the ATK directory
    const glob = new Glob("charts/**/Chart.yaml");
    const chartFiles: string[] = [];

    for await (const file of glob.scan(".")) {
      chartFiles.push(file);
    }

    if (chartFiles.length === 0) {
      console.warn("No Chart.yaml files found in charts/");
      return;
    }

    console.log(`Found ${chartFiles.length} Chart.yaml files:`);

    let updatedCount = 0;

    for (const chartPath of chartFiles) {
      try {
        const relativePath = relative(process.cwd(), chartPath);
        console.log(`  Processing: ${relativePath}`);

        // Read the current Chart.yaml file
        const file = Bun.file(chartPath);
        if (!(await file.exists())) {
          console.warn("    Skipping: File does not exist");
          continue;
        }

        const content = await file.text();
        const chart = parse(content) as ChartYaml;

        // Check if version fields exist
        if (!(chart.version || chart.appVersion)) {
          console.warn("    Skipping: No version or appVersion fields found");
          continue;
        }

        const oldVersion = chart.version;
        const oldAppVersion = chart.appVersion;
        const versionChanged = Boolean(
          chart.version && chart.version !== newVersion
        );
        const appVersionChanged = Boolean(
          chart.appVersion && chart.appVersion !== newVersion
        );

        if (versionChanged && chart.version) {
          chart.version = newVersion;
        }
        if (appVersionChanged && chart.appVersion) {
          chart.appVersion = newVersion;
        }

        // Update chart dependencies with version "*"
        const dependencyUpdates = updateChartDependencies(
          chart.dependencies,
          newVersion
        );

        const hasChanges =
          versionChanged || appVersionChanged || dependencyUpdates > 0;

        if (hasChanges) {
          // Convert back to YAML and write
          const updatedContent = stringify(chart);
          await Bun.write(chartPath, updatedContent);

          if (oldVersion && oldVersion !== newVersion) {
            console.log(`    Updated version: ${oldVersion} -> ${newVersion}`);
          }
          if (oldAppVersion && oldAppVersion !== newVersion) {
            console.log(
              `    Updated appVersion: ${oldAppVersion} -> ${newVersion}`
            );
          }
          updatedCount++;
        } else {
          console.log("    No changes needed");
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

// Run the script if called directly
if (import.meta.main) {
  // Check if running in CI environment
  if (!process.env.CI) {
    console.log("Set the CI environment variable to run this script.");
    process.exit(0);
  }

  await updateChartVersions();
  await updatePackageVersion();
}
