# network

![Version: 0.1.0](https://img.shields.io/badge/Version-0.1.0-informational?style=flat-square) ![Type: application](https://img.shields.io/badge/Type-application-informational?style=flat-square) ![AppVersion: 0.1.0](https://img.shields.io/badge/AppVersion-0.1.0-informational?style=flat-square)

A Helm chart for a blockchain network on Kubernetes

## Maintainers

| Name | Email | Url |
| ---- | ------ | --- |
| SettleMint | <support@settlemint.com> | <https://settlemint.com> |

## Requirements

| Repository | Name | Version |
|------------|------|---------|
|  | network-bootstrapper | * |
|  | network-nodes | * |

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| global.networkNodes.faucetArtifactPrefix | string | `"besu-faucet"` |  |
| global.networkNodes.genesisConfigMapName | string | `"besu-genesis"` |  |
| global.networkNodes.podPrefix | string | `"besu-node-validator"` |  |
| global.networkNodes.serviceName | string | `"besu-node"` |  |
| global.networkNodes.staticNodesConfigMapName | string | `"besu-static-nodes"` |  |
