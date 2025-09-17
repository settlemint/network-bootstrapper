#!/usr/bin/env bash
set -euo pipefail

# Bootstraps a remote Codex workspace by ensuring Bun and project dependencies are installed.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

log() {
  printf "[codex-setup] %s\n" "$1"
}

ensure_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "Missing required command: $1"
    return 1
  fi
}

install_bun() {
  local bun_version
  if [[ -f .bun-version ]]; then
    bun_version="$(< .bun-version)"
  else
    bun_version="latest"
  fi

  log "Installing Bun ${bun_version}"
  curl -fsSL https://bun.sh/install | BUN_INSTALL="${HOME}/.bun" BUN_VERSION="${bun_version}" bash
  export BUN_INSTALL="${HOME}/.bun"
  export PATH="${BUN_INSTALL}/bin:${PATH}"
}

bootstrap_bun() {
  if command -v bun >/dev/null 2>&1; then
    log "Bun $(bun --version) already installed"
    return
  fi

  ensure_command curl || {
    log "curl is required to install Bun"
    exit 1
  }
  install_bun
  log "Bun installation complete"
}

install_dependencies() {
  log "Installing project dependencies via bun install"
  bun install
}

seed_dev_artifacts() {
  if [[ ! -f bun.lock ]]; then
    log "No bun.lock found; skipping lockfile validation"
  else
    log "bun.lock detected; dependencies locked"
  fi

  if [[ ! -d .vscode ]]; then
    log "Creating .vscode directory for workspace hints"
    mkdir -p .vscode
  fi

  cat > .vscode/settings.json <<'JSON'
{
  "typescript.tsdk": "${workspaceFolder}/node_modules/typescript/lib",
  "editor.formatOnSave": true,
  "biome.lspBin": "${workspaceFolder}/node_modules/.bin/biome"
}
JSON
  log "Seeded VS Code workspace settings"
}

main() {
  log "Starting Codex environment bootstrap"
  bootstrap_bun
  install_dependencies
  seed_dev_artifacts
  log "Codex environment ready"
}

main "$@"
