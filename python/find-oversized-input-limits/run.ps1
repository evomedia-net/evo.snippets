# Evomedia.net Snippets — https://github.com/evomedia-net/evo.snippets
# Created by Kelly Michels · dev@evomedia.net
# Licensed under the MIT License. See LICENSE.

<#
.SYNOPSIS
    Launcher for find_input_limits.py -- finds user-input character limits
    above a threshold (default 2500) across any fullstack codebase.

.DESCRIPTION
    Every argument is passed straight through to the Python scanner, including
    the +name / -name language selectors. Exits 1 when findings exist so it
    works as a CI gate.

.EXAMPLE
    .\run.ps1 F:\evomedia.net\www
    .\run.ps1 . +py +json          # scan ONLY Python and JSON
    .\run.ps1 . -py -json          # scan everything EXCEPT Python and JSON
    .\run.ps1 . +json +py --json   # -> .\oversized-limits.json
    .\run.ps1 . --md --out report.md
    .\run.ps1 . --limit 2000 --high-only
    .\run.ps1 -help
    .\run.ps1 --list-groups
#>

# No param() block on purpose: it lets -py / -json reach $args as plain strings
# instead of being parsed as PowerShell parameter names.

$scanner = Join-Path $PSScriptRoot 'find_input_limits.py'
if (-not (Test-Path $scanner)) {
    Write-Error "Scanner not found: $scanner"
    exit 2
}

$python = $null
foreach ($candidate in @('python', 'python3', 'py')) {
    $found = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($found) { $python = $found.Source; break }
}
if (-not $python) {
    Write-Error 'Python 3.9+ was not found on PATH. Install it or add it to PATH.'
    exit 2
}

& $python $scanner @args
exit $LASTEXITCODE
