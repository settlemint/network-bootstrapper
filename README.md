# network-bootstrapper

Generate node identities, configure consensus, and emit a Besu genesis.

## CLI usage

### Global Help

```text
Usage: network-bootstrapper [options] [command]

Utilities for configuring Besu-based networks.

Options:
  -h, --help                 display help for command

Commands:
  generate [options]         Generate node identities, configure consensus, and
                             emit a Besu genesis.
  compile-genesis [options]  Merge per-account allocation ConfigMaps into a Besu
                             genesis file.
  download-abi [options]     Download ABI ConfigMaps annotated with
                             settlemint.com/artifact=abi into a local directory.
  help [command]             display help for command
```

### generate

```text
Usage: network-bootstrapper generate [options]

Generate node identities, configure consensus, and emit a Besu genesis.

Options:
  --static-node-domain <domain>          DNS suffix appended to validator peer hostnames for static-nodes entries.
  --static-node-namespace <name>         Namespace segment inserted between service name and domain for static-nodes entries.
  --static-node-service-name <name>      Headless Service name used when constructing static-nodes hostnames.
  --static-node-pod-prefix <prefix>      StatefulSet prefix used when constructing validator pod hostnames.
  --genesis-configmap-name <name>        ConfigMap name that stores the generated genesis.json payload.
  --static-nodes-configmap-name <name>   ConfigMap name that stores the generated static-nodes.json payload.
  --faucet-artifact-prefix <prefix>      Prefix applied to faucet ConfigMaps and Secrets.
  -v, --validators <count>               Number of validator nodes to generate. (default: 4)
  -a, --allocations <file>               Path to a genesis allocations JSON file. (default: none)
  --abi-directory <path>                 Directory containing ABI JSON files to publish as ConfigMaps.
  -o, --outputType <type>                Output target (screen, file, kubernetes). (default: "screen")
  --static-node-port <number>            P2P port used for static-nodes enode URIs. (default: 30303)
  --static-node-discovery-port <number>  Discovery port used for static-nodes enode URIs. (default: 30303)
  --consensus <algorithm>                Consensus algorithm (IBFTv2, QBFT). (default: QBFT)
  --chain-id <number>                    Chain ID for the genesis config. (default: random between 40000 and 50000)
  --seconds-per-block <number>           Block time in seconds. (default: 2)
  --gas-limit <decimal>                  Block gas limit in decimal form. (default: 9007199254740991)
  --gas-price <number>                   Base gas price (wei). (default: 0)
  --evm-stack-size <number>              EVM stack size limit. (default: 2048)
  --contract-size-limit <number>         Contract size limit in bytes. (default: 2147483647)
  --accept-defaults                      Accept default values for all prompts when CLI flags are omitted. (default: disabled)
  -h, --help                             display help for command
```

### compile-genesis

```text
Usage: network-bootstrapper compile-genesis [options]

Merge per-account allocation ConfigMaps into a Besu genesis file.

Options:
  --genesis-configmap-name <name>  Name of the ConfigMap containing the base
                                   genesis JSON. (default: "besu-genesis")
  --output-path <path>             Filesystem path for the compiled genesis
                                   output. (default: "/data/atk-genesis.json")
  -h, --help                       display help for command
```
