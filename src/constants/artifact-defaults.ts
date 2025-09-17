const ARTIFACT_DEFAULTS = {
  staticNodeServiceName: "besu-node",
  staticNodePodPrefix: "besu-node-validator",
  genesisConfigMapName: "besu-genesis",
  staticNodesConfigMapName: "besu-static-nodes",
  faucetArtifactPrefix: "besu-faucet",
} as const;

export { ARTIFACT_DEFAULTS };
