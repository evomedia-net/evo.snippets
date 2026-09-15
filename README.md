<!--
Evomedia.net Snippets — https://github.com/evomedia-net/evo.snippets
Created by Kelly Michels · kelly@evomedia.net
Licensed under the MIT License. See LICENSE.
-->

# Evomedia.net Snippets

Small, self-contained tools that solve one problem well and run anywhere. Each
snippet is a folder you can copy into a project, or run in place against any
codebase — no install step, no framework, no shared runtime between them.

## Layout

Snippets are grouped by what they do, then by the language each implementation
is written in:

```
<what-it-does>/<language>/
```

A snippet that exists in more than one language keeps its implementations side
by side under the one folder, so you find the tool first and pick a runtime
second. The language folder is about the runtime you need installed, not the
snippet's reach — the Python scanner below reads TypeScript, PHP, Go, and Java
codebases just fine, and the JavaScript one needs only a browser you already
have.

## Snippets

### find-oversized-input-limits

Finds every declared user-input character limit above a threshold, across every
common fullstack — HTML, React, Angular, Django, Pydantic, Zod, Laravel, Rails,
Go, Spring, .NET, SQL.

| Language | Folder | What you need installed |
| --- | --- | --- |
| Python | [`find-oversized-input-limits/python/`](find-oversized-input-limits/python/) | Python 3.9+ on PATH. The launchers pick the first available `python`, `python3`, or `py`. |
| TypeScript | [`find-oversized-input-limits/typescript/`](find-oversized-input-limits/typescript/) | Node 22.6+. Node runs TypeScript directly from 23.6 on; 22.6–23.5 gets `--experimental-strip-types` added by the launchers. No build step, no `package.json` — the `.ts` file is the program. |

The two are twins: same flags, same exit codes, byte-identical output. Pick by
what your machine already has.

Every flag, with a command you can paste:
[`find-oversized-input-limits/COMMAND.md`](find-oversized-input-limits/COMMAND.md).

### confetti-burst

A confetti burst that falls like paper rather than sparks — air drag,
tumble-driven flutter, and a numpad grid of firing positions.

| Language | Folder | What you need installed |
| --- | --- | --- |
| JavaScript | [`confetti-burst/javascript/`](confetti-burst/javascript/) | A browser. Nothing to install and nothing to serve: open the snippet's `evo.confetti.html` and it runs. |

Every option, with a call you can paste:
[`confetti-burst/COMMAND.md`](confetti-burst/COMMAND.md).

## Twins

Where the same snippet exists in two languages, the two are kept **behaviorally
identical**, not merely similar: same rules, same flags, same exit codes, and
byte-identical output verified by diffing both across every mode. Pick by what
your machine already has installed, not by what the snippet can do.

That guarantee is load-bearing enough to shape the code — the TypeScript twin
sorts with a codepoint comparator rather than `localeCompare` specifically so
its ordering matches Python's `sorted()`.

## Conventions

Every snippet in this repo follows the same shape, so knowing one means knowing
all of them:

- **A folder per snippet**, named for what it does.
- **`README.md` plus a plain-text `README.txt` twin**, kept in sync.
- **`COMMAND.md` at the snippet root** — every option the snippet takes, what it
  does, and a sample of its use, with a `COMMAND.txt` twin.
- **`run.ps1` and `run.sh` launchers** that pass every argument straight through,
  so the same command line works on Windows and Linux.
- **Standard library only.** No dependencies to install, no lockfile to drift.
- **Exit code 0 when clean, 1 when the tool found something**, so any snippet can
  be dropped into CI as a gate without a wrapper.
- **`-help` works**, alongside `--help`, `--h`, `-h`, and `-?`.

## License

Authored by Kelly Michels. Copyright Evomedia.net LLC, licensed MIT — see
[LICENSE](LICENSE). Use them, fork them, ship them in your own work.

## Checks

There is one, and it runs with nothing installed:

```
python check_no_local_paths.py
```

CI runs it on every push to `main` and every pull request
([`.github/workflows/checks.yml`](.github/workflows/checks.yml)), and it is a
required check on `main` - a pull request with a red run cannot merge.

It refuses any tracked file that contains a path from a developer's own
machine — a drive-letter path, a WSL mount, a Windows profile directory. Usage examples use
`C:\path\to\project` or `/path/to/project` instead — an example that only
works on the author's disk is an example that works nowhere.

## Contact

Kelly Michels · [kelly@evomedia.net](mailto:kelly@evomedia.net) ·
[evomedia.net](https://evomedia.net)

Issues and pull requests are welcome. If a snippet misses a pattern in a stack
you use, that is worth reporting — coverage breadth is the whole point.
