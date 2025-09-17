# network-bootstrapper

![Version: 0.1.0](https://img.shields.io/badge/Version-0.1.0-informational?style=flat-square) ![Type: application](https://img.shields.io/badge/Type-application-informational?style=flat-square) ![AppVersion: 0.1.0](https://img.shields.io/badge/AppVersion-0.1.0-informational?style=flat-square)

A Helm chart for Kubernetes

## Maintainers

| Name | Email | Url |
| ---- | ------ | --- |
| SettleMint | <support@settlemint.com> | <https://settlemint.com> |

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| affinity | object | `{}` |  |
| clusterDomain | string | `"svc.cluster.local"` |  |
| defaultStaticNodeDiscoveryPort | int | `30303` |  |
| defaultStaticNodePort | int | `30303` |  |
| fullnameOverride | string | `"bootstrapper"` |  |
| image.pullPolicy | string | `"IfNotPresent"` |  |
| image.repository | string | `"ghcr.io/settlemint/network-bootstrapper"` |  |
| image.tag | string | `""` |  |
| imagePullSecrets | list | `[]` |  |
| nameOverride | string | `""` |  |
| nodeSelector | object | `{}` |  |
| podAnnotations | object | `{}` |  |
| podLabels | object | `{}` |  |
| podSecurityContext | object | `{}` |  |
| rbac.create | bool | `true` |  |
| resources | object | `{}` |  |
| securityContext | object | `{}` |  |
| serviceAccount.annotations | object | `{}` |  |
| serviceAccount.automount | bool | `true` |  |
| serviceAccount.create | bool | `true` |  |
| serviceAccount.name | string | `""` |  |
| settings.allocations | string | `nil` |  |
| settings.chainId | string | `nil` |  |
| settings.consensus | string | `nil` |  |
| settings.contractSizeLimit | string | `nil` |  |
| settings.evmStackSize | string | `nil` |  |
| settings.gasLimit | string | `nil` |  |
| settings.gasPrice | string | `nil` |  |
| settings.outputType | string | `"kubernetes"` |  |
| settings.secondsPerBlock | string | `nil` |  |
| settings.staticNodeDiscoveryPort | string | `nil` |  |
| settings.staticNodeDomain | string | `nil` |  |
| settings.staticNodeNamespace | string | `nil` |  |
| settings.staticNodePort | string | `nil` |  |
| settings.validators | string | `nil` |  |
| tolerations | list | `[]` |  |
| volumeMounts | list | `[]` |  |
| volumes | list | `[]` |  |
