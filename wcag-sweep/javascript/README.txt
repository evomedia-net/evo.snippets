evomedia.net Snippets — https://github.com/evomedia-net/evo.snippets
Created by Kelly Michels · kelly@evomedia.net
Licensed under the MIT License. See LICENSE.

wcag-sweep (JavaScript)
=======================

Crawls a site and runs **axe-core's WCAG 2.2 Level A and AA rules on every
page**, in the Chrome or Edge already on your machine. One file, nothing to
install, no account, no page limit but the one you set.

Written because a whole-site accessibility sweep is the thing every online
checker charges for. The free ones check one page at a time; this one takes a
sitemap, a crawl or a list, audits each page at the widths you name, and hands
you a report you can read, send, or fail a build on.

INSTALL.md (INSTALL.md) is a step-by-step setup guide that assumes no prior
experience: check your Node version, run one command, open the report.
Everything below is the reference.

Run it
------

    ./run.sh https://example.com --crawl --report report.html

    .\run.ps1 https://example.com --crawl --report report.html

That follows every same-origin link from the home page, two levels deep, up to
25 pages, audits each at 1280px, prints a summary, and writes a self-contained
HTML report. Exit code 1 if anything failed a rule, 0 if clean, 2 if it could
not run.

Or call it directly, if Node 22+ is on your PATH:

    node wcag-sweep.mjs --sitemap https://example.com/sitemap.xml --width 1280,375 --reflow

What you get
------------

- On the console, one line per page per width while it runs, then a summary:
  how many elements fail, grouped by rule, with how many pages each rule touches.
- --report file.html: a single HTML file with no scripts and no external
  resources. A summary, a table of rules, a table of pages, and for every rule
  the pages, the elements (as CSS selectors) and axe-core's own fix text. It is
  readable with a screen reader, in dark mode, and on a phone, which is the least
  an accessibility report can do.
- --json file.json: everything, for your own tooling.

What it checks
--------------

The WCAG 2.0, 2.1 and 2.2 Level A and AA rules in axe-core, and nothing else:
no "best practice" rules, no experimental ones. A clean run means the automated
half of the standard is clean. It does not mean the site conforms: keyboard
order, meaningful names, captions and the sense of the text still need a
person. The report says so on its first screen.

--reflow adds two checks that axe does not make. At 320px, the narrowest width
WCAG 1.4.10 asks a page to work at, it measures sideways overflow of the whole
page, and it applies WCAG 1.4.12's text-spacing overrides and reports any box
that clips more of its text than it did before.

--html data-a11y=on sets an attribute on <html> before the rules run. If a
site has an accessibility mode keyed on such an attribute, that is how you audit
the mode as well as the default look.

Where the pages come from
-------------------------

| Source | Flag | Notes |
| --- | --- | --- |
| Addresses you give | <url> ... | As many as you like. |
| A sitemap | --sitemap <url> | Reads every <loc>; follows a sitemap index. |
| A list | --urls <file> | One per line, # comments. |
| A crawl | --crawl | Follows same-origin links from each page audited, breadth first, until --max-pages (25) or --depth (2). |

They combine; duplicates are dropped, /, /index.html and /#top count once,
and anything whose extension says it is not a page (PDF, image, script, feed) is
skipped and listed. --list prints the pages a run would audit and stops, which
turns a crawl into a --urls file you can keep.

For a scanner that takes addresses from strangers
-------------------------------------------------

--public-only resolves every hostname, before the first request and again
after any redirect, and refuses anything on a private, loopback, link-local or
carrier-grade NAT address, or named localhost, .localhost or .local. Off
by default, because the commonest use of this tool is a dev server on
localhost. On for anything that lets other people choose the target.

The browser and axe-core
------------------------

It finds Chrome, Edge or Chromium on Windows, macOS and Linux; --chrome <path>
or the WCAG_SWEEP_CHROME variable overrides. Each width gets its own headless
instance with a throwaway profile, deleted when the run ends.

axe-core is vendored in vendor/axe-core/ rather than fetched: version 4.11.4,
unmodified, with its MPL-2.0 licence beside it and its SHA-256 pinned in the
script. A copy that does not match the checksum refuses to run, because an audit
with rules nobody reviewed is not an audit. --axe <path> runs another copy and
the report records that it did. axe-core is © Deque Systems; this tool is not
affiliated with Deque.

Every flag
----------

../COMMAND.md lists every option with a command you can
paste. -help prints the same from the tool.

Tests
-----

    node --test

runs the unit tests beside the script: argument parsing, URL canonicalisation,
the public-address guard, the summary and the report. They need no browser.
