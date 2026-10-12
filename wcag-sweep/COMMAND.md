<!--
evomedia.net Snippets — https://github.com/evomedia-net/evo.snippets
Created by Kelly Michels · kelly@evomedia.net
Licensed under the MIT License. See LICENSE.
-->

# wcag-sweep — command reference

Every option the sweep takes, what it does, and a command you can paste.

## Running it

[`javascript/`](javascript/) ships `run.ps1` and `run.sh`, which pass every
argument straight through. The same command line works on Windows and Linux.

```
./run.sh  https://example.com --crawl
.\run.ps1 https://example.com --crawl
```

Or call the program directly, if Node 22+ is on your PATH:

```
node wcag-sweep.mjs https://example.com --crawl
```

Exit code 0 when clean, 1 when violations were found, 2 on a usage or
environment error.

## Where the pages come from

Sources combine. Duplicates are dropped and `/`, `/index.html` and `/#top`
count as one page.

| Option | What it does |
| --- | --- |
| `<url> ...` | Audit these pages. |
| `--sitemap <url>` | Audit every `<loc>` in a sitemap. A sitemap index is followed. |
| `--urls <file>` | Audit the addresses in a file, one per line; `#` starts a comment. |
| `--crawl` | Follow same-origin links from each page audited, breadth first. |
| `--max-pages <n>` | Stop after this many pages, whatever the source. Default 25. `0` is no cap. |
| `--depth <n>` | How many links deep a crawl goes from a start page. Default 2. `0` audits only the pages given. |
| `--exclude <regex>` | Skip discovered pages whose address matches, case-insensitive. Repeatable. Calendars and faceted search can make a site endless; this is how to leave them out. |
| `--list` | Print the pages that would be audited and stop. With `--crawl`, that is the crawl's result. |

```
./run.sh https://example.com                                  one page
./run.sh https://example.com --crawl                          the site, 25 pages, 2 deep
./run.sh https://example.com --crawl --max-pages 100 --depth 3
./run.sh https://example.com --crawl --max-pages 0 --depth 50 --exclude /calendar/
                                                              the whole site, no page cap
./run.sh --sitemap https://example.com/sitemap.xml
./run.sh --urls pages.txt
./run.sh https://example.com --crawl --list > pages.txt       keep the crawl as a list
```

## Signing in

For the pages behind a site's sign-in. The sweep runs headless; the sign-in
happens once, in a browser window you can use.

| Option | What it does |
| --- | --- |
| `--login <url>` | Open a visible browser at this sign-in page. Sign in there however the site asks (password, passkey, SSO, a code from your phone), then press Enter in the terminal. The sweep runs with that session. The tool never sees a password. |
| `--session <file>` | With `--login`, keep the session in this file. Without it, sweep with a session kept earlier: unattended, until the site ends the session. |
| `--header <name: value>` | Send this request header to the site's own origin, and to no other host a page loads from. For a staging site behind basic auth or a token. Repeatable. |

```
./run.sh https://app.example.com/ --crawl --login https://app.example.com/login
./run.sh https://app.example.com/ --crawl --login https://app.example.com/login --session app.session.json
./run.sh https://app.example.com/ --crawl --session app.session.json        later, no window
./run.sh https://staging.example.com/ --crawl --header "Authorization: $STAGING_AUTH"
```

- **What the session is.** The cookies the site set while you signed in, kept
  only for the hosts being swept (an identity provider's cookies are left
  out), and each swept origin's local storage, where single-page apps keep
  their tokens. They are put into every headless browser before its first
  page.
- **Keep the session file like a password.** Anyone holding it is signed in as
  you until the site ends the session. It is written readable by its owner
  only (where the file system has that notion), and never copied into the
  report. Keep it out of shared folders and repositories, and delete it when
  the work is done.
- **Log-out links are not followed** while signed in: following one would end
  the session the sweep runs on. They are listed as skipped. Add your own
  patterns with `--exclude`, for links that change things when opened.
- **When the session ends** partway through - it expired, or you signed out
  elsewhere - the site sends the next page to its sign-in page. The sweep
  says so on the console and in the report, with the page where it happened.
- **Limits.** A sign-in kept only in `sessionStorage` does not carry over: it
  belongs to one browser tab. A crawl follows `<a href>` links. A menu that
  navigates by script finds no pages, so give them with `--urls`, or start
  from a page that links to every other (a site map).
- **Use a test account where you can.** The sweep only opens pages, but a page
  that changes something just by being opened will change it.

## How each page is rendered

| Option | What it does |
| --- | --- |
| `--width <list>` | Viewport widths, comma separated. Each page is audited once per width. Default `1280`. `375` is a phone; `320` is the floor WCAG 1.4.10 names. |
| `--html <attr=value>` | Set an attribute on `<html>` before the rules run. For sites with an accessibility mode keyed on such an attribute. |
| `--timeout <ms>` | Per-page load timeout. Default 30000. |
| `--delay <ms>` | Pause between page loads, out of politeness to the target. Default 500. |
| `--user-agent <s>` | Override the User-Agent. The default names this tool and links to this repository. |

```
./run.sh https://example.com --crawl --width 1280,375
./run.sh https://example.com --html data-a11y=on
./run.sh https://example.com --crawl --timeout 60000 --delay 1000
```

## What is checked

| Option | What it does |
| --- | --- |
| `--tags <list>` | axe-core tags to run. Default `wcag2a,wcag2aa,wcag21a,wcag21aa,wcag22aa` — WCAG 2.0, 2.1 and 2.2, Level A and AA, nothing else. |
| `--reflow` | Also measure, at 320px, sideways overflow of the page (1.4.10) and text that clips when WCAG's spacing overrides are applied (1.4.12). |
| `--public-only` | Refuse any address whose host resolves to a private, loopback, link-local or carrier-grade NAT address, or is named `localhost`, `*.localhost` or `*.local` — before the first request and again after a redirect. For a scanner that takes addresses from strangers. |

```
./run.sh https://example.com --crawl --reflow
./run.sh https://example.com --tags wcag2a,wcag21a                only Level A
./run.sh http://localhost:5173/ --crawl                            a dev server (no --public-only)
./run.sh https://example.com --public-only                        what a public scanner should pass
```

## Where the result goes

| Option | What it does |
| --- | --- |
| `--json <file>` | The full report as JSON: every page, width, rule, element and fix text, plus what was skipped and why. |
| `--report <file>` | A self-contained HTML report: no scripts, no external resources, readable in dark mode, on a phone and with a screen reader. |
| `--quiet` | Only the summary on the console; no per-page lines. |
| `--fail-on <any\|none>` | `any` (default) exits 1 when anything fails a rule; `none` always exits 0, for a report-only step. |

```
./run.sh https://example.com --crawl --report report.html
./run.sh https://example.com --crawl --json sweep.json --report report.html --quiet
./run.sh https://example.com --crawl --fail-on none
```

## The browser and the rules

| Option | What it does |
| --- | --- |
| `--chrome <path>` | The Chrome, Edge or Chromium executable to use. Otherwise found in the usual places on Windows, macOS and Linux; the `WCAG_SWEEP_CHROME` environment variable also overrides. |
| `--axe <path>` | Run another copy of `axe.min.js` instead of the vendored, checksum-pinned 4.11.4. The report records which copy ran. |

```
./run.sh https://example.com --chrome "C:\path\to\chrome.exe"
./run.sh https://example.com --axe /path/to/axe.min.js
```

## Help and version

`-help`, `--help`, `-h`, `--h` and `-?` print the reference; `--version` prints
the version.

## What a run looks like

```
$ ./run.sh https://example.com --crawl --width 1280,375 --report report.html

https://example.com/ @1280: 2 rules / 5 nodes failing
https://example.com/ @375: 3 rules / 9 nodes failing
https://example.com/about.html @1280: 0 rules / 0 nodes failing
https://example.com/about.html @375: 1 rules / 1 nodes failing
...
12 pages at 1280, 375px — 31 nodes failing across 4 rules.
     18  color-contrast                   serious   9 pages  Elements must meet minimum color contrast ratio thresholds
      8  scrollable-region-focusable      serious   5 pages  Scrollable region must have keyboard access
      4  link-name                        serious   2 pages  Links must have discernible text
      1  label                            critical  1 page   Form elements must have labels
Report: report.html
```

The exit code is 1, because something failed. Open `report.html` for the page,
the element and the fix for every one of the 31.

---

Part of [evomedia.net Snippets](https://github.com/evomedia-net/evo.snippets).
Setup and background: [`javascript/INSTALL.md`](javascript/INSTALL.md),
[`javascript/README.md`](javascript/README.md).
