# network

![Version: 1.0.16](https://img.shields.io/badge/Version-1.0.16-informational?style=flat-square) ![Type: application](https://img.shields.io/badge/Type-application-informational?style=flat-square) ![AppVersion: 1.0.16](https://img.shields.io/badge/AppVersion-1.0.16-informational?style=flat-square)

A Helm chart for a blockchain network on Kubernetes

## Maintainers

| Name | Email | Url |
| ---- | ------ | --- |
| SettleMint | <support@settlemint.com> | <https://settlemint.com> |

## Requirements

| Repository | Name | Version |
|------------|------|---------|
|  | network-bootstrapper | >=0.0.0-0 |
|  | network-nodes | >=0.0.0-0 |

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| extraInitContainers | list | `[]` | Additional init containers appended verbatim to each workload. |
| global | object | `{"chainId":13456,"networkNodes":{"faucetArtifactPrefix":"besu-faucet","genesisConfigMapName":"besu-genesis","podPrefix":"","serviceName":"","staticNodesConfigMapName":"besu-static-nodes"},"securityContexts":{"container":{},"pod":{}}}` | Global configuration shared across subcharts. |
| global.chainId | int | `13456` | Chain ID applied when charts omit explicit overrides. |
| global.networkNodes | object | `{"faucetArtifactPrefix":"besu-faucet","genesisConfigMapName":"besu-genesis","podPrefix":"","serviceName":"","staticNodesConfigMapName":"besu-static-nodes"}` | Defaults consumed by Besu network node workloads. |
| global.networkNodes.faucetArtifactPrefix | string | `"besu-faucet"` | Prefix used for faucet ConfigMaps and Secrets. |
| global.networkNodes.genesisConfigMapName | string | `"besu-genesis"` | ConfigMap name storing the generated genesis.json artifact. |
| global.networkNodes.podPrefix | string | `""` | StatefulSet prefix used for validator pod hostnames. |
| global.networkNodes.serviceName | string | `""` | Kubernetes Service name fronting validator pods to align bootstrapper static-nodes output. |
| global.networkNodes.staticNodesConfigMapName | string | `"besu-static-nodes"` | ConfigMap name storing static-nodes.json entries. |
| global.securityContexts | object | `{"container":{},"pod":{}}` | Shared pod- and container-level security contexts applied when subcharts omit explicit overrides. |
| global.securityContexts.container | object | `{}` | Container security context inherited by subcharts when set. |
| global.securityContexts.pod | object | `{}` | Pod security context inherited by subcharts when set. |
| initContainer | object | `{"tcpCheck":{"dependencies":[],"enabled":false,"image":{"pullPolicy":"IfNotPresent","repository":"ghcr.io/settlemint/btp-waitforit","tag":"v7.7.10"},"resources":{"limits":{"cpu":"100m","memory":"64Mi"},"requests":{"cpu":"10m","memory":"32Mi"}},"timeout":120}}` | Init container configuration shared by subcharts. |
| initContainer.tcpCheck.dependencies | list | `[]` | TCP dependencies expressed as name/endpoint pairs (host:port). |
| initContainer.tcpCheck.enabled | bool | `false` | Enable the TCP dependency check init container by default. |
| initContainer.tcpCheck.image.pullPolicy | string | `"IfNotPresent"` | Image pull policy for the tcp-check init container. |
| initContainer.tcpCheck.image.repository | string | `"ghcr.io/settlemint/btp-waitforit"` | OCI image hosting the tcp-check utility. |
| initContainer.tcpCheck.image.tag | string | `"v7.7.10"` | Image tag for the tcp-check utility. |
| initContainer.tcpCheck.timeout | int | `120` | Timeout in seconds applied to each dependency probe. |
