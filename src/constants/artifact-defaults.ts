const ARTIFACT_DEFAULTS = {
  staticNodeServiceName: "besu-node",
  staticNodePodPrefix: "besu-node-validator",
  genesisConfigMapName: "besu-genesis",
  staticNodesConfigMapName: "besu-static-nodes",
  faucetArtifactPrefix: "besu-faucet",
  subgraphConfigMapName: "besu-subgraph",
} as const;

export { ARTIFACT_DEFAULTS };
