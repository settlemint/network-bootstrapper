#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
README_TEMPLATE="${REPO_ROOT}/README.tpl"
README_OUTPUT="${REPO_ROOT}/README.md"
ENTRYPOINT="${REPO_ROOT}/src/index.ts"

if [[ ! -f "${README_TEMPLATE}" ]]; then
  echo "README template not found at ${README_TEMPLATE}" >&2
  exit 1
fi

cp "${README_TEMPLATE}" "${README_OUTPUT}"

append_section() {
  local heading="$1"
  shift
  local command=("${@}")

  {
    printf '\n### %s\n\n' "${heading}"
    printf '```text\n'
    NO_COLOR=1 "${command[@]}"
    printf '```\n'
  } >> "${README_OUTPUT}"
}

# The template already ends with the CLI usage heading; start sections immediately.
append_section "Global Help" bun "${ENTRYPOINT}" --help

append_section "generate" bun "${ENTRYPOINT}" generate --help

append_section "compile-genesis" bun "${ENTRYPOINT}" compile-genesis --help
