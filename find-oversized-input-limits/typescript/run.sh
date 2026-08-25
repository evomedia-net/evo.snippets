#!/usr/bin/env bash
# Evomedia.net Snippets — https://github.com/evomedia-net/evo.snippets
# Created by Kelly Michels · kelly@evomedia.net
# Licensed under the MIT License. See LICENSE.
#
# Launcher for findInputLimits.ts -- finds user-input character limits
# above a threshold (default 2500) across any fullstack codebase.
#
# Every argument is passed straight through to the scanner, including the
# +name / -name language selectors. Exits 1 when findings exist so it works
# as a CI gate; 2 on a usage or environment error.
#
#   ./run.sh /srv/www
#   ./run.sh . +py +json          # scan ONLY Python and JSON
#   ./run.sh . -py -json          # scan everything EXCEPT Python and JSON
#   ./run.sh . +json +py --json   # -> ./YYYYMMDD-HH-MM-SS-oversized-limits.json
#   ./run.sh . --md --out report.md
#   ./run.sh . --limit 2000 --high-only
#   ./run.sh -help
#   ./run.sh --list-groups

set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCANNER="$DIR/findInputLimits.ts"

if [ ! -f "$SCANNER" ]; then
    echo "Scanner not found: $SCANNER" >&2
    exit 2
fi

if ! command -v node >/dev/null 2>&1; then
    echo "Node.js 22.6+ was not found on PATH. Install it or add it to PATH." >&2
    exit 2
fi

# Node runs TypeScript directly from 23.6 on; 22.6-23.5 needs the flag, and
# anything older cannot strip types at all. Reading the major version keeps the
# same source file working across all three cases without a build step.
NODE_VERSION="$(node --version)"           # e.g. v24.17.0
NODE_MAJOR="${NODE_VERSION#v}"
NODE_MAJOR="${NODE_MAJOR%%.*}"

if [ "$NODE_MAJOR" -ge 23 ] 2>/dev/null; then
    exec node "$SCANNER" "$@"
elif [ "$NODE_MAJOR" -eq 22 ] 2>/dev/null; then
    exec node --experimental-strip-types "$SCANNER" "$@"
else
    echo "Node $NODE_VERSION cannot run TypeScript directly; 22.6+ is required." >&2
    echo "Either upgrade Node, or use the Python twin in ../python." >&2
    exit 2
fi
