const ARTIFACT_DEFAULTS = {
  staticNodeServiceName: "besu-validators",
  staticNodePodPrefix: "besu-validators",
  rpcNodeServiceName: "besu-rpc-headless",
  rpcNodePodPrefix: "besu-rpc",
  genesisConfigMapName: "besu-genesis",
  staticNodesConfigMapName: "besu-static-nodes",
  faucetArtifactPrefix: "besu-faucet",
  subgraphConfigMapName: "besu-subgraph",
} as const;

export { ARTIFACT_DEFAULTS };
