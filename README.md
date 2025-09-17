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
                                  (default: 4)
  -r, --rpc-nodes <count>         Number of RPC nodes to generate. (default: 2)
  -a, --allocations <file>        Path to a genesis allocations JSON file.
                                  (default: none)
  -o, --outputType <type>         Output target (screen, file, kubernetes).
                                  (default: "screen")
  --consensus <algorithm>         Consensus algorithm (IBFTv2, QBFT). (default:
                                  QBFT)
  --chain-id <number>             Chain ID for the genesis config. (default:
                                  random between 40000 and 50000)
  --seconds-per-block <number>    Block time in seconds. (default: 2)
  --gas-limit <decimal>           Block gas limit in decimal form. (default:
                                  9007199254740991)
  --gas-price <number>            Base gas price (wei). (default: 0)
  --evm-stack-size <number>       EVM stack size limit. (default: 2048)
  --contract-size-limit <number>  Contract size limit in bytes. (default:
                                  2147483647)
  --accept-defaults               Accept default values for all prompts when CLI
                                  flags are omitted. (default: disabled)
  -h, --help                      display help for command
```
