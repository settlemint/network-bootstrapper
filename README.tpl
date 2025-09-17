# network-bootstrapper

Generate node identities, configure consensus, and emit a Besu genesis.

## Helm chart

The helm chart to run this on Kubernetes / OpenShift can be found [here](./charts/network-bootstrapper/README.md)

### Deployment modes

Two deployment paths are supported: fully auto-generated artefacts or supplying your own genesis/static peers while sourcing node keys from an external secret store such as Conjur.

#### Auto-generated artefacts (bootstrapper job)

```bash
cat <<'EOF' > values-generated.yaml
network-bootstrapper:
  artifacts:
    source: generated
  settings:
    validators: 4

network-nodes:
  global:
    validatorReplicaCount: 4
EOF

helm upgrade --install besu-network ./charts/network \
  --namespace besu \
  --create-namespace \
  --values values-generated.yaml
```

The bootstrapper Job generates the genesis file, static-nodes list, validator keys, and faucet account and publishes them as ConfigMaps/Secrets consumed by the Besu StatefulSets.

#### External genesis/static peers with Conjur-managed keys

Genesis and static peer data can be committed to version control while validator and faucet private keys are injected at deployment time. The chart expects the validator count in `artifacts.external.validators` to match `global.validatorReplicaCount`.

Create a Summon manifest describing the Conjur variables and a templated values file that references the injected environment variables:

```bash
cat <<'EOF' > conjur.env.yml
BESU_NODE_VALIDATOR_0_PRIVATE_KEY: !var production/besu/validator0/private-key
BESU_NODE_VALIDATOR_1_PRIVATE_KEY: !var production/besu/validator1/private-key
BESU_FAUCET_PRIVATE_KEY: !var production/besu/faucet/private-key
EOF

cat <<'EOF' > values-external.tpl.yaml
network-bootstrapper:
  artifacts:
    source: external
    external:
      genesis:
        config:
          chainId: 12345
        alloc:
          "0xfund":
            balance: "0x56bc75e2d63100000"
        extraData: "0x"
      staticNodes:
        - enode://node1@validator-0.besu.svc.cluster.local:30303
        - enode://node2@validator-1.besu.svc.cluster.local:30303
      validators:
        - address: "0x111"
          publicKey: "0x222"
          privateKey: "${BESU_NODE_VALIDATOR_0_PRIVATE_KEY}"
          enode: enode://validator1@validator-0.besu.svc.cluster.local:30303
        - address: "0x333"
          publicKey: "0x444"
          privateKey: "${BESU_NODE_VALIDATOR_1_PRIVATE_KEY}"
          enode: enode://validator2@validator-1.besu.svc.cluster.local:30303
      faucet:
        address: "0xfaucet"
        publicKey: "0xfaucetpub"
        privateKey: "${BESU_FAUCET_PRIVATE_KEY}"

  global:
    validatorReplicaCount: 2

network-nodes:
  validatorReplicaCount:
  global:
    validatorReplicaCount: 2
EOF

summon -f conjur.env.yml envsubst < values-external.tpl.yaml > values-external.yaml

helm upgrade --install besu-network ./charts/network \
  --namespace besu \
  --create-namespace \
  --values values-external.yaml

rm values-external.yaml
```

Summon resolves the secrets in memory, `envsubst` renders them into a transient values file, and Helm creates the ConfigMaps/Secrets required by the Besu nodes. The temporary file is removed once the release is installed.

### Local artefact generation with Docker

Run the bootstrapper container locally to capture all artefacts before loading them into Conjur or another secret manager.

```bash
mkdir -p artifacts

docker run --rm \
  -v "$(pwd)/artifacts:/workspace" \
  ghcr.io/settlemint/network-bootstrapper:0.1.0 \
  generate \
    --validators=2 \
    --outputType=file \
    --chain-id=12345 \
    --seconds-per-block=2 \
    --gas-limit=9007199254740991 \
    --accept-defaults

LATEST_DIR=$(ls -t artifacts/out | head -n 1)

for ordinal in 0 1; do
  jq -r '.privateKey' "artifacts/out/${LATEST_DIR}/besu-node-validator-${ordinal}-private-key" \
    | conjur variable values add production/besu/validator${ordinal}/private-key -
done

jq -r '.privateKey' "artifacts/out/${LATEST_DIR}/besu-faucet-private-key" \
  | conjur variable values add production/besu/faucet/private-key -

jq -r '.genesis.json' "artifacts/out/${LATEST_DIR}/besu-genesis" > genesis.json
jq -r '."static-nodes.json"' "artifacts/out/${LATEST_DIR}/besu-static-nodes" > static-nodes.json
```

The container writes artefacts beneath `/workspace/out/<timestamp>`; mounting a host directory captures the results. Each validator and faucet file is emitted as JSON for ease of parsing. After loading secrets into Conjur, reference the same variables in your Summon configuration and embed the exported `genesis.json` and `static-nodes.json` within the Helm values file.

## CLI usage
