Evomedia.net Snippets — https://github.com/evomedia-net/evo.snippets
Created by Kelly Michels · dev@evomedia.net
Licensed under the MIT License. See LICENSE.

Evomedia.net Snippets
=====================

Small, self-contained tools that solve one problem well and run anywhere. Each
snippet is a folder you can copy into a project, or run in place against any
codebase - no install step, no framework, no shared runtime between them.


Layout
------

Snippets are grouped by the language you need installed to run them, then by
what the snippet does:

    <language>/<what-it-does>/

A snippet's language folder is about its runtime, not its reach - the Python
tool below scans TypeScript, PHP, Go, and Java codebases just fine.


Snippets
--------

python

| Snippet | What it does |
| --- | --- |
| find-oversized-input-limits (python/find-oversized-input-limits/) | Finds every declared user-input character limit above a threshold, across every common fullstack - HTML, React, Angular, Django, Pydantic, Zod, Laravel, Rails, Go, Spring, .NET, SQL |

Needs Python 3.9+ on PATH. The launchers pick the first available python,
python3, or py.


Conventions
-----------

Every snippet in this repo follows the same shape, so knowing one means knowing
all of them:

- A folder per snippet, named for what it does.
- README.md plus a plain-text README.txt twin, kept in sync.
- run.ps1 and run.sh launchers that pass every argument straight through,
  so the same command line works on Windows and Linux.
- Standard library only. No dependencies to install, no lockfile to drift.
- Exit code 0 when clean, 1 when the tool found something, so any snippet can
  be dropped into CI as a gate without a wrapper.
- -help works, alongside --help, --h, -h, and -?.


License
-------

MIT - see LICENSE. Use them, fork them, ship them in your own work.


Contact
-------

Kelly Michels · dev@evomedia.net (mailto:dev@evomedia.net) ·
evomedia.net (https://evomedia.net)

Issues and pull requests are welcome. If a snippet misses a pattern in a stack
you use, that is worth reporting - coverage breadth is the whole point.
