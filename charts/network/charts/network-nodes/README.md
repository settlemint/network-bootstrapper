# network-nodes

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
| config.bonsaiLimitTrieLogsEnabled | bool | `false` |  |
| config.cacheLastBlocks | int | `1024` |  |
| config.dataStorageFormat | string | `"FOREST"` |  |
| config.graphql.corsOrigins[0] | string | `"all"` |  |
| config.graphql.enabled | bool | `true` |  |
| config.graphql.host | string | `"0.0.0.0"` |  |
| config.hostAllowlist[0] | string | `"*"` |  |
| config.http.api[0] | string | `"DEBUG"` |  |
| config.http.api[10] | string | `"PLUGINS"` |  |
| config.http.api[1] | string | `"ETH"` |  |
| config.http.api[2] | string | `"ADMIN"` |  |
| config.http.api[3] | string | `"WEB3"` |  |
| config.http.api[4] | string | `"IBFT"` |  |
| config.http.api[5] | string | `"NET"` |  |
| config.http.api[6] | string | `"TRACE"` |  |
| config.http.api[7] | string | `"QBFT"` |  |
| config.http.api[8] | string | `"PERM"` |  |
| config.http.api[9] | string | `"TXPOOL"` |  |
| config.http.authenticationEnabled | bool | `false` |  |
| config.http.corsOrigins[0] | string | `"all"` |  |
| config.http.enabled | bool | `true` |  |
| config.http.host | string | `"0.0.0.0"` |  |
| config.http.maxActiveConnections | int | `2000` |  |
| config.http.maxBatchSize | int | `512` |  |
| config.http.maxRequestContentLength | int | `524288000` |  |
| config.logging | string | `"INFO"` |  |
| config.metrics.categories[0] | string | `"BLOCKCHAIN"` |  |
| config.metrics.categories[10] | string | `"TRANSACTION_POOL"` |  |
| config.metrics.categories[1] | string | `"ETHEREUM"` |  |
| config.metrics.categories[2] | string | `"EXECUTORS"` |  |
| config.metrics.categories[3] | string | `"JVM"` |  |
| config.metrics.categories[4] | string | `"NETWORK"` |  |
| config.metrics.categories[5] | string | `"PEERS"` |  |
| config.metrics.categories[6] | string | `"PROCESS"` |  |
| config.metrics.categories[7] | string | `"PRUNER"` |  |
| config.metrics.categories[8] | string | `"RPC"` |  |
| config.metrics.categories[9] | string | `"SYNCHRONIZER"` |  |
| config.metrics.enabled | bool | `true` |  |
| config.metrics.host | string | `"0.0.0.0"` |  |
| config.minGasPrice | int | `0` |  |
| config.p2p.discoveryEnabled | bool | `true` |  |
| config.p2p.enabled | bool | `true` |  |
| config.p2p.interface | string | `"0.0.0.0"` |  |
| config.p2p.maxPeers | int | `25` |  |
| config.p2p.staticNodesFile | string | `"/etc/besu/static-nodes.json"` |  |
| config.privateKeyFilename | string | `"privateKey"` |  |
| config.randomPeerPriorityEnabled | bool | `true` |  |
| config.receiptCompactionEnabled | bool | `true` |  |
| config.remoteConnectionsLimitEnabled | bool | `false` |  |
| config.revertReasonEnabled | bool | `true` |  |
| config.rpc.txFeecap | int | `0` |  |
| config.sync.minPeers | int | `1` |  |
| config.sync.mode | string | `"FULL"` |  |
| config.txPool.enableSaveRestore | bool | `true` |  |
| config.txPool.limitByAccountPercentage | int | `1` |  |
| config.txPool.maxSize | int | `100000` |  |
| config.txPool.noLocalPriority | bool | `true` |  |
| config.txPool.type | string | `"SEQUENCED"` |  |
| config.ws.api[0] | string | `"DEBUG"` |  |
| config.ws.api[10] | string | `"PLUGINS"` |  |
| config.ws.api[1] | string | `"ETH"` |  |
| config.ws.api[2] | string | `"ADMIN"` |  |
| config.ws.api[3] | string | `"WEB3"` |  |
| config.ws.api[4] | string | `"IBFT"` |  |
| config.ws.api[5] | string | `"NET"` |  |
| config.ws.api[6] | string | `"TRACE"` |  |
| config.ws.api[7] | string | `"QBFT"` |  |
| config.ws.api[8] | string | `"PERM"` |  |
| config.ws.api[9] | string | `"TXPOOL"` |  |
| config.ws.authenticationEnabled | bool | `false` |  |
| config.ws.enabled | bool | `true` |  |
| config.ws.host | string | `"0.0.0.0"` |  |
| config.ws.maxActiveConnections | int | `2000` |  |
| config.ws.maxFrameSize | int | `2097152` |  |
| fullnameOverride | string | `""` |  |
| httpRoute | object | `{"annotations":{},"enabled":false,"hostnames":["chart-example.local"],"parentRefs":[{"name":"gateway","sectionName":"http"}],"rules":[{"matches":[{"path":{"type":"PathPrefix","value":"/headers"}}]}]}` | Expose the service via gateway-api HTTPRoute Requires Gateway API resources and suitable controller installed within the cluster (see: https://gateway-api.sigs.k8s.io/guides/) |
| image.pullPolicy | string | `"IfNotPresent"` |  |
| image.repository | string | `"docker.io/hyperledger/besu"` |  |
| image.tag | string | `"25.8.0"` |  |
| imagePullSecrets | list | `[]` |  |
| ingress.annotations | object | `{}` |  |
| ingress.className | string | `""` |  |
| ingress.enabled | bool | `false` |  |
| ingress.hosts[0].host | string | `"chart-example.local"` |  |
| ingress.hosts[0].paths[0].path | string | `"/"` |  |
| ingress.hosts[0].paths[0].pathType | string | `"ImplementationSpecific"` |  |
| ingress.tls | list | `[]` |  |
| livenessProbe.httpGet.path | string | `"/"` |  |
| livenessProbe.httpGet.port | string | `"http"` |  |
| nameOverride | string | `""` |  |
| nodeSelector | object | `{}` |  |
| openShiftRoute | object | `{"alternateBackends":[],"annotations":{},"enabled":false,"host":"","path":"","port":{"targetPort":"http"},"tls":null,"to":{"weight":100},"wildcardPolicy":""}` | Expose the service via OpenShift Route when running on OpenShift clusters     This relies on the OpenShift router to make the network nodes reachable externally. |
| persistence.accessModes[0] | string | `"ReadWriteOnce"` |  |
| persistence.annotations | object | `{}` |  |
| persistence.enabled | bool | `false` |  |
| persistence.existingClaim | string | `""` |  |
| persistence.mountPath | string | `"/data"` |  |
| persistence.readOnly | bool | `false` |  |
| persistence.retention.whenDeleted | string | `"Retain"` |  |
| persistence.retention.whenScaled | string | `"Delete"` |  |
| persistence.selector | object | `{}` |  |
| persistence.size | string | `"20Gi"` |  |
| persistence.storageClass | string | `""` |  |
| persistence.subPath | string | `""` |  |
| persistence.volumeMode | string | `""` |  |
| persistence.volumeName | string | `"data"` |  |
| podAnnotations | object | `{}` |  |
| podLabels | object | `{}` |  |
| podSecurityContext | object | `{}` |  |
| readinessProbe.httpGet.path | string | `"/"` |  |
| readinessProbe.httpGet.port | string | `"http"` |  |
| resources | object | `{}` |  |
| rpcReplicaCount | int | `2` |  |
| securityContext | object | `{}` |  |
| service.p2pType | string | `"NodePort"` |  |
| service.ports.discovery | int | `30303` |  |
| service.ports.graphql | int | `8547` |  |
| service.ports.metrics | int | `9545` |  |
| service.ports.rlpx | int | `30303` |  |
| service.ports.rpc | int | `8545` |  |
| service.ports.ws | int | `8546` |  |
| service.type | string | `"ClusterIP"` |  |
| serviceAccount.annotations | object | `{}` |  |
| serviceAccount.automount | bool | `true` |  |
| serviceAccount.create | bool | `true` |  |
| serviceAccount.name | string | `""` |  |
| tolerations | list | `[]` |  |
| validatorReplicaCount | int | `4` |  |
| volumeMounts | list | `[]` |  |
| volumes | list | `[]` |  |
