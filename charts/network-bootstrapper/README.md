# network-bootstrapper

![Version: 0.1.0](https://img.shields.io/badge/Version-0.1.0-informational?style=flat-square) ![Type: application](https://img.shields.io/badge/Type-application-informational?style=flat-square) ![AppVersion: 0.1.0](https://img.shields.io/badge/AppVersion-0.1.0-informational?style=flat-square)

A Helm chart for Kubernetes

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| affinity | object | `{}` |  |
| fullnameOverride | string | `""` |  |
| image.pullPolicy | string | `"IfNotPresent"` |  |
| image.repository | string | `"ghcr.io/settlemint/network-bootstrapper"` |  |
| image.tag | string | `""` |  |
| imagePullSecrets | list | `[]` |  |
| nameOverride | string | `""` |  |
| nodeSelector | object | `{}` |  |
| podAnnotations | object | `{}` |  |
| podLabels | object | `{}` |  |
| podSecurityContext | object | `{}` |  |
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
| settings.outputType | string | `nil` |  |
| settings.rpcNodes | string | `nil` |  |
| settings.secondsPerBlock | string | `nil` |  |
| settings.validators | string | `nil` |  |
| tolerations | list | `[]` |  |
| volumeMounts | list | `[]` |  |
| volumes | list | `[]` |  |
