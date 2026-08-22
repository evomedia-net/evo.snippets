# Evomedia.net Snippets — https://github.com/evomedia-net/evo.snippets
# Created by Kelly Michels · dev@evomedia.net
# Licensed under the MIT License. See LICENSE.

<#
.SYNOPSIS
    Launcher for findInputLimits.ts -- finds user-input character limits
    above a threshold (default 2500) across any fullstack codebase.

.DESCRIPTION
    Every argument is passed straight through to the scanner, including the
    +name / -name language selectors. Exits 1 when findings exist so it works
    as a CI gate; 2 on a usage or environment error.

.EXAMPLE
    .\run.ps1 C:\path\to\project
    .\run.ps1 . +py +json          # scan ONLY Python and JSON
    .\run.ps1 . -py -json          # scan everything EXCEPT Python and JSON
    .\run.ps1 . +json +py --json   # -> .\YYYYMMDD-HH-MM-SS-oversized-limits.json
    .\run.ps1 . --md --out report.md
    .\run.ps1 . --limit 2000 --high-only
    .\run.ps1 -help
    .\run.ps1 --list-groups
#>

# No param() block on purpose: it lets -py / -json / -help reach $args as plain
# strings instead of being parsed as PowerShell parameter names.

$scanner = Join-Path $PSScriptRoot 'findInputLimits.ts'
if (-not (Test-Path $scanner)) {
    Write-Error "Scanner not found: $scanner"
    exit 2
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Error 'Node.js 22.6+ was not found on PATH. Install it or add it to PATH.'
    exit 2
}

# Node runs TypeScript directly from 23.6 on; 22.6-23.5 needs the flag, and
# anything older cannot strip types at all. Reading the major version keeps the
# same source file working across all three cases without a build step.
$nodeVersion = (& $node.Source --version)            # e.g. v24.17.0
$nodeMajor = [int](($nodeVersion.TrimStart('v') -split '\.')[0])

if ($nodeMajor -ge 23) {
    & $node.Source $scanner @args
}
elseif ($nodeMajor -eq 22) {
    & $node.Source --experimental-strip-types $scanner @args
}
else {
    Write-Error "Node $nodeVersion cannot run TypeScript directly; 22.6+ is required. Either upgrade Node, or use the Python twin in ..\..\python."
    exit 2
}

exit $LASTEXITCODE
