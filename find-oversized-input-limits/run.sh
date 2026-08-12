#!/usr/bin/env bash
# Evomedia.net Snippets — https://github.com/evomedia-net/evo.snippets
# Created by Kelly Michels · dev@evomedia.net
# Licensed under the MIT License. See LICENSE.
#
# Launcher for find_input_limits.py -- finds user-input character limits
# above a threshold (default 2500) across any fullstack codebase.
#
# Every argument is passed straight through to the Python scanner, including
# the +name / -name language selectors. Exits 1 when findings exist so it
# works as a CI gate.
#
#   ./run.sh /srv/www
#   ./run.sh . +py +json          # scan ONLY Python and JSON
#   ./run.sh . -py -json          # scan everything EXCEPT Python and JSON
#   ./run.sh . +json +py --json   # -> ./oversized-limits.json
#   ./run.sh . --md --out report.md
#   ./run.sh . --limit 2000 --high-only
#   ./run.sh -help
#   ./run.sh --list-groups

set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCANNER="$DIR/find_input_limits.py"

if [ ! -f "$SCANNER" ]; then
    echo "Scanner not found: $SCANNER" >&2
    exit 2
fi

PYTHON=""
for candidate in python3 python py; do
    if command -v "$candidate" >/dev/null 2>&1; then
        PYTHON="$candidate"
        break
    fi
done

if [ -z "$PYTHON" ]; then
    echo "Python 3.9+ was not found on PATH. Install it or add it to PATH." >&2
    exit 2
fi

exec "$PYTHON" "$SCANNER" "$@"
