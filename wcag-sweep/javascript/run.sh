#!/usr/bin/env bash
# evomedia.net Snippets — https://github.com/evomedia-net/evo.snippets
# Created by Kelly Michels · kelly@evomedia.net
# Licensed under the MIT License. See LICENSE.
#
# Launcher for wcag-sweep.mjs -- a WCAG 2.2 A/AA sweep of a site with
# axe-core, in the Chrome, Edge or Chromium already on this machine.
#
# Every argument is passed straight through. Exits 1 when violations were
# found so it works as a CI gate; 2 on a usage or environment error.
#
#   ./run.sh https://example.com --crawl
#   ./run.sh --sitemap https://example.com/sitemap.xml --width 1280,375 --report report.html
#   ./run.sh https://example.com/page --html data-a11y=on
#   ./run.sh http://localhost:5173/ --crawl --reflow
#   ./run.sh -help

set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SWEEP="$DIR/wcag-sweep.mjs"

if [ ! -f "$SWEEP" ]; then
    echo "Sweep not found: $SWEEP" >&2
    exit 2
fi

if ! command -v node >/dev/null 2>&1; then
    echo "Node.js 22 or newer was not found on PATH. Install it or add it to PATH." >&2
    exit 2
fi

# Node 22 brought the built-in WebSocket this uses to talk to the browser.
NODE_VERSION="$(node --version)"           # e.g. v24.17.0
NODE_MAJOR="${NODE_VERSION#v}"
NODE_MAJOR="${NODE_MAJOR%%.*}"
if ! [ "$NODE_MAJOR" -ge 22 ] 2>/dev/null; then
    echo "Node $NODE_VERSION is too old; 22 or newer is required." >&2
    exit 2
fi

exec node "$SWEEP" "$@"
