# evomedia.net Snippets — https://github.com/evomedia-net/evo.snippets
# Created by Kelly Michels · kelly@evomedia.net
# Licensed under the MIT License. See LICENSE.

<#
.SYNOPSIS
    Launcher for wcag-sweep.mjs -- a WCAG 2.2 A/AA sweep of a site with
    axe-core, in the Chrome or Edge already on this machine.

.DESCRIPTION
    Every argument is passed straight through. Exits 1 when violations were
    found so it works as a CI gate; 2 on a usage or environment error.

.EXAMPLE
    .\run.ps1 https://example.com --crawl
    .\run.ps1 --sitemap https://example.com/sitemap.xml --width 1280,375 --report report.html
    .\run.ps1 https://example.com/page --html data-a11y=on
    .\run.ps1 http://localhost:5173/ --crawl --reflow
    .\run.ps1 -help
#>

# No param() block on purpose: it lets -help and -h reach $args as plain
# strings instead of being parsed as PowerShell parameter names.

$sweep = Join-Path $PSScriptRoot 'wcag-sweep.mjs'
if (-not (Test-Path $sweep)) {
    Write-Error "Sweep not found: $sweep"
    exit 2
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Error 'Node.js 22 or newer was not found on PATH. Install it or add it to PATH.'
    exit 2
}

# Node 22 brought the built-in WebSocket this uses to talk to the browser.
$nodeVersion = (& $node.Source --version)            # e.g. v24.17.0
$nodeMajor = [int](($nodeVersion.TrimStart('v') -split '\.')[0])
if ($nodeMajor -lt 22) {
    Write-Error "Node $nodeVersion is too old; 22 or newer is required."
    exit 2
}

& $node.Source $sweep @args
exit $LASTEXITCODE
