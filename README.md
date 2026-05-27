# FugaEdge

A desktop trading journal for momentum day-traders.

## Releases

Windows installers are published to the [GitHub Releases page](https://github.com/jahjafuga/FugaEdge/releases). Download the latest installer and run it.

## Supported brokers

Universal import architecture — drop the broker's native export file in. Currently supported formats:

- DAS Trader summary CSV
- DAS Trader execution CSV
- DAS Trader Account Report CSV (companion file for fee data)
- Webull mobile CSV
- Webull desktop XLSX

## System requirements

Windows 10 or later.

## Test data

The `test-fixtures/` directory contains real beta-tester trading data shared privately for testing purposes. These files never enter git — the `.gitignore` excludes the directory entirely.

Contributors who need to run import tests against real-world data should obtain fixtures privately or generate synthetic equivalents.

## License

All rights reserved. FugaEdge is a commercial product.
