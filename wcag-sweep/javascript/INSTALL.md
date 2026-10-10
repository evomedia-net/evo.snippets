<!--
evomedia.net Snippets — https://github.com/evomedia-net/evo.snippets
Created by Kelly Michels · kelly@evomedia.net
Licensed under the MIT License. See LICENSE.
-->

# wcag-sweep — setup guide

A step-by-step guide to sweeping a site for WCAG 2.2 A and AA failures.

**There is no build step and no `package.json`.** The `.mjs` file is the
program, Node runs it directly, and the one library it uses (axe-core) is in the
folder beside it. Nothing to install, nothing to compile, no dependencies to
download.

---

## What it is for

You have a website and want to know whether it fails the accessibility rules a
machine can check, on every page, not just the one you happen to be looking at.
This crawls the site, runs axe-core's WCAG 2.2 rules on each page in a headless
browser, and writes a report you can read or hand to whoever will fix it.

---

## Step 1 — Check your Node version

Open a terminal and type:

```
node --version
```

> **Opening a terminal:** on Windows press the Start button and type
> `PowerShell`, then press Enter. On macOS press Cmd+Space, type `Terminal`,
> press Enter. On Linux it is usually Ctrl+Alt+T.

You need **v22.0.0 or newer**. If the command is not found, or the number is
lower, install the current LTS from [nodejs.org](https://nodejs.org/) and open a
new terminal.

## Step 2 — Check for a browser

The sweep drives Google Chrome, Microsoft Edge or Chromium in the background.
Nearly every machine has one of them. If yours does not, install Chrome from
[google.com/chrome](https://www.google.com/chrome/); if it is installed somewhere
unusual, pass `--chrome` with the path to the executable.

## Step 3 — Get the snippet

Either clone the repository:

```
git clone https://github.com/evomedia-net/evo.snippets.git
cd evo.snippets/wcag-sweep/javascript
```

or download just this folder and open a terminal inside it. Keep
`vendor/axe-core/` beside `wcag-sweep.mjs`: the script checks that file's
checksum and refuses to run without it.

## Step 4 — Run it

Windows:

```
.\run.ps1 https://example.com --crawl --report report.html
```

macOS and Linux:

```
./run.sh https://example.com --crawl --report report.html
```

Replace `https://example.com` with the site you want to check. It prints one line
per page as it goes, then a summary, and writes `report.html` in the current
folder. The first run takes a minute or two for 25 pages; most of that is the
browser loading pages.

> If PowerShell says scripts are disabled, run
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, or call Node
> directly: `node wcag-sweep.mjs https://example.com --crawl --report report.html`.

## Step 5 — Read the report

Open `report.html` in any browser. The summary says how many elements fail and
under which rules. The **Findings** section lists, for each rule, every page and
element that fails it, with axe-core's own description of what to change. The
**Pages** table shows the count per page, and per width if you asked for more
than one.

A report with no failures means the automated rules are clean. The page says,
in its first paragraph, what that does and does not prove.

## Checking a site that is not public yet

Point it at your dev server:

```
./run.sh http://localhost:5173/ --crawl --reflow
```

That works because `--public-only` is off by default. Leave it off for your own
machine; turn it on only when other people choose the addresses.

## Using it as a gate

The exit code is 1 when anything fails a rule and 0 when nothing does, so a
one-line step in any CI system turns it into a check:

```
./run.sh --sitemap https://example.com/sitemap.xml --width 1280,375 --quiet
```

`--fail-on none` makes it exit 0 regardless, for a report-only step.

---

## Troubleshooting

| Message | What it means |
| --- | --- |
| `no Chrome, Edge or Chromium found` | None in the usual places. Pass `--chrome <path>` or set `WCAG_SWEEP_CHROME`. |
| `vendored axe-core does not match the pinned checksum` | `vendor/axe-core/axe.min.js` is not the file this version was tested with. Re-download the folder. |
| `no page was audited` | Every address was skipped; the lines under it say why (not public, not HTML, redirected elsewhere). |
| `timed out after 30000 ms` on a page | The page did not finish loading in time. Raise `--timeout`, or check the page by hand. |
| The sweep stops at 25 pages | That is `--max-pages`. Raise it, or use `--sitemap` for the full list. |

---

Part of [evomedia.net Snippets](https://github.com/evomedia-net/evo.snippets).
Every flag: [`../COMMAND.md`](../COMMAND.md).
