# Selective Artifact Generation

This document describes the selective artifact generation feature that allows you to generate only specific artifacts when bootstrapping a Besu network.

## Overview

By default, the network-bootstrapper generates all artifacts:
- **genesis**: Genesis configuration file
- **keys**: Validator and faucet private keys and node identities
- **abis**: Contract ABI ConfigMaps
- **subgraph**: Subgraph hash ConfigMap
- **allocations**: Account allocation ConfigMaps

The `--artifacts` flag allows you to specify which artifacts to generate, skipping others. This is useful for:

- **Security**: Omit private keys in production upgrades
- **Performance**: Skip unnecessary artifacts when only updating specific configurations
- **Flexibility**: Generate configuration needed for specific use cases (e.g., only ABIs for contract interactions)

## CLI Usage

### Generate only genesis and ABIs (no private keys)

```bash
bun run src/index.ts generate --artifacts genesis,abis
```

### Generate only subgraph and allocations

```bash
bun run src/index.ts generate --artifacts subgraph,allocations
```

### Generate only contract ABIs

```bash
bun run src/index.ts generate --artifacts abis
```

### Generate all artifacts (default)

```bash
bun run src/index.ts generate
# or explicitly specify all:
bun run src/index.ts generate --artifacts genesis,keys,abis,subgraph,allocations
```

## Artifact Types

- **genesis**: Besu genesis.json configuration including initial allocations
- **keys**: Validator node private keys, addresses, enodes, and faucet account keys
- **abis**: Contract ABI files published as ConfigMaps
- **subgraph**: Subgraph IPFS hash ConfigMap
- **allocations**: Per-account allocation ConfigMaps (separate from genesis)

## Kubernetes Deployment

The artifact selection works seamlessly with all output modes:

- **screen**: Only prints selected artifacts to console
- **file**: Only writes selected artifact files to the output directory
- **kubernetes**: Only creates ConfigMaps and Secrets for selected artifacts

Example with Kubernetes output:

```bash
bun run src/index.ts generate \
  --outputType kubernetes \
  --artifacts genesis,abis,subgraph
```

## Helm Chart Integration

To enable selective artifact generation in your Helm chart, add the `--artifacts` flag to the bootstrapper Job.

### Update your values.yaml

Add a new settings value:

```yaml
settings:
  # ... existing settings ...
  
  # Comma-separated list of artifacts to generate
  # Valid values: genesis, keys, abis, subgraph, allocations
  # Empty or omitted = all artifacts (default)
  artifacts: ""
```

### Update your Job template

In your Helm chart's bootstrap job template (typically in `templates/bootstrap-job.yaml` or similar), add the `--artifacts` flag to the bootstrapper command args:

```yaml
args:
  - generate
  # ... other args ...
  {{- with .Values.settings.artifacts }}
  - --artifacts={{ . }}
  {{- end }}
  # ... remaining args ...
```

### Example: Safe Production Upgrade

For production upgrades where you want to regenerate configuration without exposing private keys:

```yaml
# values.yaml
settings:
  artifacts: "genesis,abis,subgraph"  # Omit 'keys' and 'allocations'
```

This generates:
- Genesis configuration
- Contract ABIs for smart contract interactions
- Subgraph hash for indexing
- **Excludes**: Private keys, validator keys, and account allocations

### Example: dApp Deployment Configuration

For deploying dApps that need allocations and subgraph but not node keys:

```yaml
# values.yaml
settings:
  artifacts: "subgraph,allocations"
```

## Security Considerations

When omitting the `keys` artifact:
- No validator private keys are generated or exposed
- No faucet account private key is generated
- Static nodes and enode information are still generated
- Existing keys in Kubernetes secrets are preserved

### Recommended for Production

For maximum security in production:

```yaml
settings:
  artifacts: "genesis,abis,subgraph"
```

This ensures:
- Private keys are never regenerated or exposed
- Existing validator secrets remain unchanged
- Only necessary configuration is updated
- Full traceability of what was generated

## Use Cases

### 1. Initial Network Bootstrap

```bash
# Generate everything for initial setup
bun run src/index.ts generate --outputType kubernetes
```

### 2. Configuration Update Only

```bash
# Update genesis and ABIs without touching keys
bun run src/index.ts generate \
  --outputType kubernetes \
  --artifacts genesis,abis
```

### 3. Add Smart Contracts

```bash
# Update only contract ABIs and subgraph
bun run src/index.ts generate \
  --outputType kubernetes \
  --artifacts abis,subgraph \
  --abi-directory ./new-contracts/abi
```

### 4. Re-allocate Accounts

```bash
# Update account allocations
bun run src/index.ts generate \
  --outputType kubernetes \
  --artifacts allocations \
  --allocations ./new-allocations.json
```

## Output Format

When using selective artifacts, the output files and ConfigMaps will only include the selected artifact types:

```
out/
  2025-11-11_12-30-45-123/
    genesis.json              # Only if 'genesis' selected
    besu-node-validator-0-private-key  # Only if 'keys' selected
    besu-node-validator-0-address      # Only if 'keys' selected
    besu-node-validator-0-enode        # Only if 'keys' selected
    besu-node-validator-0-pubkey       # Only if 'keys' selected
    faucet-private-key                 # Only if 'keys' selected
    faucet-address                     # Only if 'keys' selected
    faucet-pubkey                      # Only if 'keys' selected
    abi-sample.json                    # Only if 'abis' selected
    subgraph.json                      # Only if 'subgraph' selected
    static-nodes.json                  # Always included
```

Note: Static nodes are always generated regardless of artifact selection.

## Implementation Details

### Artifact Filter

The artifact filter is implemented as a boolean configuration object:

```typescript
type ArtifactFilter = {
  genesis: boolean;
  keys: boolean;
  abis: boolean;
  subgraph: boolean;
  allocations: boolean;
};
```

### Parsing

The `--artifacts` flag accepts comma-separated values:

- Valid: `genesis,keys,abis`
- Valid: `genesis, keys, abis` (whitespace is trimmed)
- Invalid: `genesis,invalid-type` (error thrown)
- Empty/omitted: All artifacts enabled

### Error Handling

Invalid artifact types throw an error with a helpful message:

```
Invalid artifact kind: "invalid". Must be one of: genesis, keys, abis, subgraph, allocations
```

## Testing

The feature includes comprehensive tests for:
- Artifact filter parsing and validation
- Screen output filtering
- File output filtering
- Kubernetes output filtering
- Common use cases

Run tests with:

```bash
bun test
```

Run specific artifact tests with:

```bash
bun test bootstrap.artifacts-filter.test.ts
bun test bootstrap.selective-artifacts.test.ts
```

## Backward Compatibility

The feature is fully backward compatible:
- Default behavior (no `--artifacts` flag) generates all artifacts
- Existing scripts and Helm charts continue to work without changes
- New `--artifacts` flag is optional

## Questions & Support

For issues or questions about selective artifact generation:
1. Check the tests in `bootstrap.artifacts-filter.test.ts` for usage examples
2. Review the implementation in `bootstrap.artifacts-filter.ts`
3. File an issue on the GitHub repository
