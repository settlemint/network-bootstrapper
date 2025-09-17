# network-bootstrapper

Generate node identities, configure consensus, and emit a Besu genesis.

## Helm chart

The helm chart to run this on Kubernetes / OpenShift can be found [here](./charts/network-bootstrapper/README.md)

## CLI usage

```
Usage: network-bootstrapper [options]

Generate node identities, configure consensus, and emit a Besu genesis.

Options:
  -v, --validators <count>        Number of validator nodes to generate.
  -r, --rpc-nodes <count>         Number of RPC nodes to generate.
  -a, --allocations <file>        Path to a genesis allocations JSON file.
  -o, --outputType <type>         Output target (screen, file, kubernetes).
                                  (default: "screen")
  --consensus <algorithm>         Consensus algorithm (IBFTv2, QBFT).
  --chain-id <number>             Chain ID for the genesis config.
  --seconds-per-block <number>    Block time in seconds.
  --gas-limit <decimal>           Block gas limit in decimal form.
  --gas-price <number>            Base gas price (wei).
  --evm-stack-size <number>       EVM stack size limit.
  --contract-size-limit <number>  Contract size limit in bytes.
  -h, --help                      display help for command
```
