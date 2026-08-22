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

typescript

| Snippet | What it does |
| --- | --- |
| find-oversized-input-limits (typescript/find-oversized-input-limits/) | The same scanner, same flags, byte-identical output - for machines with Node but no Python |

Needs Node 22.6+. Node runs TypeScript directly from 23.6 on; 22.6-23.5 gets
--experimental-strip-types added by the launchers. No build step, no
package.json - the .ts file is the program.


Twins
-----

Where the same snippet exists in two languages, the two are kept behaviorally
identical, not merely similar: same rules, same flags, same exit codes, and
byte-identical output verified by diffing both across every mode. Pick by what
your machine already has installed, not by what the snippet can do.

That guarantee is load-bearing enough to shape the code - the TypeScript twin
sorts with a codepoint comparator rather than localeCompare specifically so
its ordering matches Python's sorted().


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


Checks
------

There is one, and it runs with nothing installed:

    python check_no_local_paths.py

CI runs it on every push to main and every pull request
(.github/workflows/checks.yml), and it is a required check on main - a
pull request with a red run cannot merge.

It refuses any tracked file that contains a path from a developer's own
machine - a drive-letter path, a WSL mount, a Windows profile directory. Usage examples use
C:\path\to\project or /path/to/project instead - an example that only
works on the author's disk is an example that works nowhere.

Contact
-------

Kelly Michels · dev@evomedia.net (mailto:dev@evomedia.net) ·
evomedia.net (https://evomedia.net)

Issues and pull requests are welcome. If a snippet misses a pattern in a stack
you use, that is worth reporting - coverage breadth is the whole point.
