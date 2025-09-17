# network-bootstrapper

Generate node identities, configure consensus, and emit a Besu genesis.

## Helm chart

The helm chart to run this on Kubernetes / OpenShift can be found [here](./charts/network-bootstrapper/README.md)

## CLI usage

```
Usage: network-bootstrapper [options] [command]

Utilities for configuring Besu-based networks.

Options:
  -h, --help          display help for command

Commands:
  generate [options]  Generate node identities, configure consensus, and emit a
                      Besu genesis.
  help [command]      display help for command
```
