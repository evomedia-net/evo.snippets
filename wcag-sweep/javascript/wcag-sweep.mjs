#!/usr/bin/env node
// evomedia.net Snippets — https://github.com/evomedia-net/evo.snippets
// Created by Kelly Michels · kelly@evomedia.net
// Licensed under the MIT License. See LICENSE.
//
// wcag-sweep — crawl a site and run axe-core's WCAG 2.2 A and AA rules on
// every page, in the Chrome or Edge already on the machine.
//
//   node wcag-sweep.mjs https://example.com --crawl
//   node wcag-sweep.mjs --sitemap https://example.com/sitemap.xml --width 1280,375
//   node wcag-sweep.mjs https://example.com/a https://example.com/b --report report.html
//   node wcag-sweep.mjs -help
//
// Nothing to install. Node 22 or newer (built-in fetch and WebSocket) and a
// Chromium-family browser. axe-core is vendored beside this file, pinned by
// version and checksum, under its own MPL-2.0 licence (see vendor/axe-core/).
//
// Exit codes: 0 clean, 1 violations found, 2 usage or environment error.

import { spawn } from 'node:child_process'
import { createServer, request as httpRequest } from 'node:http'
import { createHash } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { connect, isIP } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, posix, resolve, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'

export const VERSION = '1.1.0'
const HERE = dirname(fileURLToPath(import.meta.url))

// ── axe-core, vendored and pinned ───────────────────────────────────────────
// The checksum is the contract: a swapped file fails loudly rather than
// auditing with rules nobody reviewed. --axe <path> runs any other copy and
// says so in the report.
export const AXE_VERSION = '4.11.4'
export const AXE_SHA256 = 'fb83a4378d978ecb7d2dae48a3a3778a84c971ac692f3afd45d714fba89c0f0d'
const AXE_PATH = join(HERE, 'vendor', 'axe-core', 'axe.min.js')

// WCAG 2.2 A and AA, as axe-core tags: every A and AA rule from 2.0, 2.1 and
// 2.2. No best-practice or experimental rules - those are advice, not the
// standard, and mixing them in makes "clean" mean something other than WCAG.
export const DEFAULT_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

// ── arguments ───────────────────────────────────────────────────────────────
export const HELP = `wcag-sweep ${VERSION} — WCAG 2.2 A/AA sweep of a site with axe-core in headless Chrome.

Usage
  wcag-sweep <url> [<url> ...] [options]
  wcag-sweep --sitemap <url> [options]
  wcag-sweep --urls <file> [options]

Where the pages come from (combine freely; duplicates are dropped)
  <url> ...            Pages to audit, as given.
  --sitemap <url>      Every <loc> in a sitemap.xml (or sitemap index).
  --urls <file>        One URL per line; # starts a comment.
  --crawl              Follow same-origin links from each page audited, breadth
                       first, until --max-pages or --depth is reached.
  --max-pages <n>      Page cap for the whole run (default 25).
  --depth <n>          How many links deep a crawl goes from a start page (default 2).
  --list               Print the pages that WOULD be audited, then exit 0. Turn a
                       crawl into a --urls file once and stop depending on it.

How each page is rendered
  --width <list>       Viewport widths, comma separated (default 1280). Each page
                       is audited once per width; 375 is a phone, 320 the WCAG floor.
  --html <attr=value>  Set an attribute on <html> before the rules run, e.g.
                       --html data-a11y=on to audit a site's accessibility mode.
  --timeout <ms>       Per-page load timeout (default 30000).
  --delay <ms>         Pause between page loads, politeness for the target (default 500).
  --user-agent <s>     Override the User-Agent (default names this tool and its repo).

What is checked
  --tags <list>        axe-core tags to run (default ${DEFAULT_TAGS.join(',')}).
  --reflow             Also check 1.4.10 Reflow and 1.4.12 Text Spacing at 320px:
                       sideways overflow, and text that clips when WCAG's spacing
                       overrides are applied.
  --public-only        Refuse any page whose host resolves to a private, loopback or
                       link-local address, including after redirects, and send every
                       request a page makes (images, scripts, frames, fetch,
                       WebSockets) through a filter that refuses the same addresses.
                       For a scanner that takes addresses from strangers; off by
                       default so a dev server on localhost can be audited.

Where the result goes
  --json <file>        Full machine-readable report.
  --report <file>      Self-contained HTML report, readable by anyone, no network needed.
  --quiet              Only the summary on the console.
  --fail-on <any|none> Exit 1 on any violation (default any), or always exit 0.

The browser
  --chrome <path>      Chrome, Edge or Chromium executable. Found automatically on
                       Windows, macOS and Linux; WCAG_SWEEP_CHROME overrides too.
                       WCAG_SWEEP_CHROME_FLAGS adds launch flags (space separated).
  --axe <path>         Use another copy of axe.min.js instead of the vendored,
                       checksum-pinned ${AXE_VERSION}. The report records which ran.

  -help, --help, -h, --h, -?    This text.     --version    The version.

Exit codes: 0 clean, 1 violations found (see --fail-on), 2 usage or environment error.`

export function parseArgs(argv) {
  const o = { urls: [], sitemap: [], urlFiles: [], crawl: false, maxPages: 25, depth: 2, list: false, widths: [1280], html: null, timeout: 30000, delay: 500, userAgent: null, tags: DEFAULT_TAGS, reflow: false, publicOnly: false, json: null, report: null, quiet: false, failOn: 'any', chrome: null, axe: null, help: false, version: false }
  const takes = new Set(['--sitemap', '--urls', '--max-pages', '--depth', '--width', '--html', '--timeout', '--delay', '--user-agent', '--tags', '--json', '--report', '--fail-on', '--chrome', '--axe'])
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (['-help', '--help', '-h', '--h', '-?'].includes(a)) { o.help = true; continue }
    if (a === '--version') { o.version = true; continue }
    if (takes.has(a)) {
      const v = argv[++i]
      if (v === undefined) throw new UsageError(`${a} needs a value`)
      switch (a) {
        case '--sitemap': o.sitemap.push(v); break
        case '--urls': o.urlFiles.push(v); break
        case '--max-pages': o.maxPages = positiveInt(a, v); break
        case '--depth': o.depth = positiveInt(a, v, true); break
        case '--width': o.widths = v.split(',').map((w) => positiveInt(a, w.trim())); break
        case '--html': { const eq = v.indexOf('='); if (eq < 1) throw new UsageError(`--html wants attr=value, got ${v}`); o.html = [v.slice(0, eq), v.slice(eq + 1)]; break }
        case '--timeout': o.timeout = positiveInt(a, v); break
        case '--delay': o.delay = positiveInt(a, v, true); break
        case '--user-agent': o.userAgent = v; break
        case '--tags': o.tags = v.split(',').map((t) => t.trim()).filter(Boolean); break
        case '--json': o.json = v; break
        case '--report': o.report = v; break
        case '--fail-on': if (!['any', 'none'].includes(v)) throw new UsageError(`--fail-on wants any or none, got ${v}`); o.failOn = v; break
        case '--chrome': o.chrome = v; break
        case '--axe': o.axe = v; break
      }
      continue
    }
    switch (a) {
      case '--crawl': o.crawl = true; break
      case '--list': o.list = true; break
      case '--reflow': o.reflow = true; break
      case '--public-only': o.publicOnly = true; break
      case '--quiet': o.quiet = true; break
      default:
        if (a.startsWith('-')) throw new UsageError(`unknown option ${a} (try -help)`)
        o.urls.push(a)
    }
  }
  return o
}

export class UsageError extends Error {}

function positiveInt(flag, v, allowZero = false) {
  const n = Number(v)
  if (!Number.isInteger(n) || n < (allowZero ? 0 : 1)) throw new UsageError(`${flag} wants a whole number, got ${v}`)
  return n
}

// ── URLs ────────────────────────────────────────────────────────────────────
const NOT_PAGES = /\.(pdf|zip|gz|tar|7z|rar|png|jpe?g|gif|webp|avif|svg|ico|bmp|mp4|webm|mp3|wav|ogg|m4a|css|js|mjs|json|xml|txt|csv|woff2?|ttf|otf|eot|map|wasm|exe|dmg|msi|apk)$/i

/** One canonical spelling per page, so / and /index.html and /#top count once. */
export function normalizeUrl(input, base) {
  let u
  try { u = new URL(input, base) } catch { return null }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  u.hash = ''
  u.hostname = u.hostname.toLowerCase()
  if (/\/index\.html?$/i.test(u.pathname)) u.pathname = u.pathname.replace(/index\.html?$/i, '')
  if (u.pathname === '') u.pathname = '/'
  return u.href
}

export function sameOrigin(a, b) {
  try { return new URL(a).origin === new URL(b).origin } catch { return false }
}

export function looksLikePage(url) {
  try { return !NOT_PAGES.test(new URL(url).pathname) } catch { return false }
}

// RFC 1918, loopback, link-local, CGNAT, "this network", and their IPv6
// counterparts, plus IPv4-mapped IPv6. Anything a request from inside a
// network could reach that the public could not.
export function isPrivateAddress(ip) {
  const v = isIP(ip)
  if (v === 4) {
    const [a, b, c] = ip.split('.').map(Number)
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
      || (a === 192 && b === 0 && c === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224 // IETF, benchmarking, multicast, reserved, broadcast
  }
  if (v === 6) {
    const g = ipv6Groups(ip)
    const v4 = (hi, lo) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`
    if (g.slice(0, 6).every((x) => x === 0)) return isPrivateAddress(v4(g[6], g[7])) // ::, ::1 and IPv4-compatible
    if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return isPrivateAddress(v4(g[6], g[7])) // IPv4-mapped
    if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return isPrivateAddress(v4(g[6], g[7])) // NAT64
    if (g[0] === 0x2002) return isPrivateAddress(v4(g[1], g[2])) // 6to4
    return (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xff00) === 0xff00 // unique local, link-local, multicast
  }
  return true // not an address at all: refuse
}

// Eight 16-bit groups, whichever way the address was written (::, a dotted
// IPv4 tail, a zone), so an IPv4 address inside an IPv6 one can be read.
function ipv6Groups(ip) {
  let s = ip.toLowerCase().replace(/%.*$/, '')
  const dotted = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(s)
  if (dotted) { const [a, b, c, d] = dotted.slice(1).map(Number); s = s.slice(0, dotted.index) + ((a << 8) | b).toString(16) + ':' + ((c << 8) | d).toString(16) }
  const [head, tail] = s.split('::')
  const h = head ? head.split(':') : [], tl = tail ? tail.split(':') : []
  const fill = tail === undefined ? [] : Array(8 - h.length - tl.length).fill('0')
  return [...h, ...fill, ...tl].map((x) => parseInt(x, 16))
}

export async function assertPublicHost(url) {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) throw new Error(`${host} is not a public host`)
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true })
  for (const { address } of addrs) if (isPrivateAddress(address)) throw new Error(`${host} resolves to ${address}, which is not public`)
}

// ── the egress filter ───────────────────────────────────────────────────────
// Checking a page's address is not enough: the page then loads what it likes,
// and an image, script, frame, fetch or WebSocket pointed at 192.168.1.1 or a
// container's name is a request from inside the network running the scan. So
// under --public-only every request the browser makes goes through this proxy
// on loopback. It resolves each host itself, refuses the addresses
// isPrivateAddress refuses, and connects to the address it checked, so a DNS
// answer cannot change between the check and the connection.
//
// What it refused is counted, not listed: a public report naming the internal
// hosts a page probed for would tell whoever wrote the page which ones exist.
// `resolve` and `isPrivate` are parameters for the tests.
export async function startEgressFilter({ resolve = (host) => lookup(host, { all: true }), isPrivate = isPrivateAddress, onRefuse = null } = {}) {
  let refused = 0
  const open = new Set()
  const track = (s) => { open.add(s); s.on('close', () => open.delete(s)) }
  const vet = async (raw) => {
    const host = raw.replace(/^\[|\]$/g, '').toLowerCase()
    try {
      if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) throw new Error(`${host} is not a public host`)
      const addrs = isIP(host) ? [{ address: host }] : await resolve(host)
      if (!addrs.length) throw new Error(`${host} did not resolve`)
      for (const { address } of addrs) if (isPrivate(address)) throw new Error(`${host} resolves to ${address}, which is not public`)
      return addrs[0].address
    } catch (e) {
      refused++
      if (onRefuse) onRefuse(host, e.message)
      throw e
    }
  }
  // Plain http: the request line carries the whole URL.
  const server = createServer(async (req, res) => {
    let target
    try { target = new URL(req.url) } catch { res.writeHead(400); return res.end() }
    if (target.protocol !== 'http:') { res.writeHead(400); return res.end() }
    let address
    try { address = await vet(target.hostname) } catch { res.writeHead(403, { 'Content-Type': 'text/plain' }); return res.end('refused by wcag-sweep: not a public address') }
    const headers = { ...req.headers }
    delete headers['proxy-connection']; delete headers['proxy-authorization']
    const up = httpRequest({ host: address, port: target.port || 80, method: req.method, path: target.pathname + target.search, headers, setHost: false }, (r) => {
      res.writeHead(r.statusCode, r.statusMessage, r.headers)
      r.pipe(res)
    })
    up.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end() })
    req.pipe(up)
  })
  // https and wss: CONNECT host:port, then bytes both ways. A plain ws://
  // upgrade has no listener, and Node closes those.
  server.on('connect', async (req, socket, head) => {
    track(socket); socket.on('error', () => {})
    const m = /^(\[[^\]]+\]|[^:/\s]+):(\d{1,5})$/.exec(req.url || '')
    if (!m) return socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
    let address
    try { address = await vet(m[1]) } catch { return socket.end('HTTP/1.1 403 Forbidden\r\n\r\n') }
    const up = connect(Number(m[2]), address, () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head && head.length) up.write(head)
      up.pipe(socket); socket.pipe(up)
    })
    track(up)
    up.on('error', () => socket.destroy())
    socket.on('close', () => up.destroy())
  })
  server.on('connection', track)
  server.on('clientError', (e, socket) => socket.destroy())
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  return {
    port,
    get refused() { return refused },
    // The flags that send everything through it: nothing bypasses, loopback
    // included, and WebRTC may not open UDP of its own.
    chromeFlags: () => [`--proxy-server=http://127.0.0.1:${port}`, '--proxy-bypass-list=<-loopback>', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp', '--disable-quic'],
    close: () => new Promise((r) => { for (const s of open) s.destroy(); server.close(() => r()) }),
  }
}

async function readSitemap(url, seen = new Set()) {
  if (seen.has(url) || seen.size > 50) return []
  seen.add(url)
  const r = await fetch(url, { headers: { 'user-agent': ua(null) } })
  if (!r.ok) throw new Error(`sitemap ${url}: HTTP ${r.status}`)
  const xml = await r.text()
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].trim())
  if (/<sitemapindex/i.test(xml)) {
    const out = []
    for (const child of locs) out.push(...(await readSitemap(child, seen)))
    return out
  }
  return locs
}

function readUrlFile(path) {
  return readFileSync(path, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
}

export function ua(custom) {
  return custom || `wcag-sweep/${VERSION} (+https://github.com/evomedia-net/evo.snippets)`
}

// ── the browser ─────────────────────────────────────────────────────────────
export function chromeCandidates(platform = process.platform, env = process.env) {
  // Joined with the TARGET platform's separator, so the list is right when a
  // test asks about Linux from Windows, and the other way round.
  const c = []
  if (env.WCAG_SWEEP_CHROME) c.push(env.WCAG_SWEEP_CHROME)
  if (platform === 'win32') {
    const roots = [env['PROGRAMFILES'], env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean)
    for (const r of roots) c.push(win32.join(r, 'Google', 'Chrome', 'Application', 'chrome.exe'), win32.join(r, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), win32.join(r, 'Chromium', 'Application', 'chrome.exe'))
  } else if (platform === 'darwin') {
    c.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium')
  } else {
    for (const dir of (env.PATH || '').split(':')) if (dir) for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'microsoft-edge-stable']) c.push(posix.join(dir, name))
  }
  return c
}

export function findChrome(explicit) {
  if (explicit) { if (existsSync(explicit)) return explicit; throw new UsageError(`no browser at ${explicit}`) }
  for (const p of chromeCandidates()) if (existsSync(p)) return p
  throw new UsageError('no Chrome, Edge or Chromium found; pass --chrome <path> or set WCAG_SWEEP_CHROME')
}

export class Browser {
  constructor(exe, width, flags = []) { this.exe = exe; this.width = width; this.flags = flags; this.id = 0; this.pending = new Map() }
  async start() {
    this.profile = mkdtempSync(join(tmpdir(), 'wcag-sweep-'))
    this.port = 9222 + Math.floor(Math.random() * 20000)
    // WCAG_SWEEP_CHROME_FLAGS adds flags a container may need, such as
    // --disable-dev-shm-usage, or --no-sandbox where the kernel sandbox is
    // unavailable. Space separated.
    const extra = (process.env.WCAG_SWEEP_CHROME_FLAGS || '').split(/\s+/).filter(Boolean)
    this.proc = spawn(this.exe, ['--headless=new', `--remote-debugging-port=${this.port}`, `--user-data-dir=${this.profile}`, '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-extensions', '--hide-scrollbars', '--mute-audio', `--window-size=${this.width},900`, ...this.flags, ...extra, 'about:blank'], { stdio: 'ignore' })
    let wsUrl
    for (let i = 0; i < 150 && !wsUrl; i++) { try { const r = await fetch(`http://127.0.0.1:${this.port}/json/version`); if (r.ok) wsUrl = (await r.json()).webSocketDebuggerUrl } catch {} if (!wsUrl) await sleep(200) }
    if (!wsUrl) throw new Error('the browser did not come up')
    this.ws = new WebSocket(wsUrl)
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej })
    this.ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && this.pending.has(d.id)) { const p = this.pending.get(d.id); this.pending.delete(d.id); d.error ? p.reject(new Error(d.error.message)) : p.resolve(d.result) } }
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' })
    this.session = (await this.send('Target.attachToTarget', { targetId, flatten: true })).sessionId
    await this.send('Page.enable', {}, this.session)
    await this.send('Runtime.enable', {}, this.session)
    await this.send('Emulation.setDeviceMetricsOverride', { width: this.width, height: 900, deviceScaleFactor: 1, mobile: this.width < 768 }, this.session)
  }
  send(method, params = {}, sessionId) { const id = ++this.id; return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params, sessionId })) }) }
  async setUserAgent(s) { await this.send('Network.setUserAgentOverride', { userAgent: s }, this.session) }
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, this.session)
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
    return r.result.value
  }
  async open(url, timeout) {
    await this.send('Page.navigate', { url }, this.session)
    const t0 = Date.now()
    while (Date.now() - t0 < timeout) { if ((await this.evaluate('document.readyState')) === 'complete') break; await sleep(100) }
    if ((await this.evaluate('document.readyState')) !== 'complete') throw new Error(`timed out after ${timeout} ms`)
    await sleep(500) // fonts and late scripts
    return { url: await this.evaluate('location.href'), type: await this.evaluate('document.contentType'), title: await this.evaluate('document.title') }
  }
  async close() { try { this.ws.close() } catch {} try { this.proc.kill() } catch {} try { rmSync(this.profile, { recursive: true, force: true }) } catch {} }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── the checks ──────────────────────────────────────────────────────────────
const AXE_RUN = (tags) => `axe.run(document, { runOnly: { type: 'tag', values: ${JSON.stringify(tags)} }, resultTypes: ['violations', 'incomplete'] }).then((r) => ({
  violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl, tags: v.tags.filter((t) => /^wcag/.test(t)), nodes: v.nodes.map((n) => ({ target: n.target.join(' '), html: n.html.slice(0, 300), fix: n.failureSummary })) })),
  incomplete: r.incomplete.map((v) => ({ id: v.id, help: v.help, count: v.nodes.length })),
}))`

const LINKS = `[...document.links].map((a) => a.href)`

// 1.4.10: does the page scroll sideways at 320px? 1.4.12: with WCAG's spacing
// overrides applied, does any box that clips its content clip MORE than it
// did before? Only clipping the spacing causes counts - a ticker or carousel
// that hides its off-screen entries on purpose clips at every spacing and is
// not a text-spacing failure.
const REFLOW = `(() => {
  const doc = document.documentElement
  const out = { overflow: Math.max(0, doc.scrollWidth - doc.clientWidth), clipped: [] }
  const boxes = []
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el)
    if (cs.overflow !== 'hidden' && cs.overflowX !== 'hidden' && cs.overflowY !== 'hidden') continue
    if (el.closest('pre, table, svg, video, canvas, math, iframe')) continue
    if (!el.textContent.trim()) continue
    // A 1px box with its text clipped is the visually-hidden pattern for
    // screen-reader-only text; it is meant to clip at every spacing.
    if (el.clientWidth <= 2 || el.clientHeight <= 2) continue
    boxes.push({ el, w: el.scrollWidth - el.clientWidth, h: el.scrollHeight - el.clientHeight })
  }
  const style = document.createElement('style')
  style.textContent = '*{line-height:1.5!important;letter-spacing:0.12em!important;word-spacing:0.16em!important} p{margin-bottom:2em!important}'
  document.head.appendChild(style)
  for (const b of boxes) {
    const w = b.el.scrollWidth - b.el.clientWidth, h = b.el.scrollHeight - b.el.clientHeight
    if ((w > 2 && w > b.w + 2) || (h > 2 && h > b.h + 2)) {
      const el = b.el
      const tag = el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/)[0] : '')
      out.clipped.push({ target: tag, text: el.textContent.trim().replace(/\\s+/g, ' ').slice(0, 60) })
      if (out.clipped.length >= 20) break
    }
  }
  style.remove()
  return out
})()`

// ── the run ─────────────────────────────────────────────────────────────────
// `o.onPage(page, state)` is called as each page starts ('start') and ends
// ('done'), and `o.onQueue(audited, queued)` after each page, so a host that
// shows a report while it is being made has something to show. `o.signal` is
// an AbortSignal: once aborted, no further page is started.
export async function sweep(o, log = console.error) {
  const chrome = findChrome(o.chrome)
  let axeSource, axeNote
  if (o.axe) { axeSource = readFileSync(o.axe, 'utf8'); axeNote = `${o.axe} (not the vendored copy)` }
  else {
    if (!existsSync(AXE_PATH)) throw new UsageError(`vendored axe-core is missing at ${AXE_PATH}`)
    axeSource = readFileSync(AXE_PATH, 'utf8')
    const sha = createHash('sha256').update(axeSource).digest('hex')
    if (sha !== AXE_SHA256) throw new UsageError(`vendored axe-core does not match the pinned checksum (${sha.slice(0, 12)}… vs ${AXE_SHA256.slice(0, 12)}…); refusing to audit with rules nobody reviewed`)
    axeNote = `axe-core ${AXE_VERSION}, vendored, checksum verified`
  }

  // Seed pages.
  const seeds = []
  for (const u of o.urls) { const n = normalizeUrl(u); if (!n) throw new UsageError(`not an http(s) URL: ${u}`); seeds.push(n) }
  for (const s of o.sitemap) for (const u of await readSitemap(s)) { const n = normalizeUrl(u); if (n) seeds.push(n) }
  for (const f of o.urlFiles) for (const u of readUrlFile(f)) { const n = normalizeUrl(u); if (n) seeds.push(n) }
  if (!seeds.length) throw new UsageError('no pages: give URLs, --sitemap or --urls (try -help)')
  const queue = [...new Set(seeds)].map((url) => ({ url, depth: 0 }))
  const seen = new Set(queue.map((q) => q.url))
  const report = { tool: 'wcag-sweep', version: VERSION, generated: new Date().toISOString(), axe: axeNote, options: { widths: o.widths, tags: o.tags, html: o.html, crawl: o.crawl, maxPages: o.maxPages, depth: o.depth, reflow: o.reflow, publicOnly: o.publicOnly }, pages: [], skipped: [] }

  if (o.list && !o.crawl) { for (const q of queue) console.log(q.url); return { report, exit: 0 } }

  // Under --public-only the browser reaches the network only through the filter.
  const egress = o.publicOnly ? await startEgressFilter({ onRefuse: o.quiet ? null : (host, why) => log(`refused a request: ${why}`) }) : null
  const flags = egress ? egress.chromeFlags() : []
  const browsers = new Map()
  const browserFor = async (w) => { if (!browsers.has(w)) { const b = new Browser(chrome, w, flags); await b.start(); await b.setUserAgent(ua(o.userAgent)); browsers.set(w, b) } return browsers.get(w) }
  if (o.reflow && !o.widths.includes(320)) await browserFor(320)

  try {
    let audited = 0
    while (queue.length && audited < o.maxPages) {
      const { url, depth } = queue.shift()
      if (!looksLikePage(url)) { report.skipped.push({ url, why: 'not a page by its extension' }); continue }
      if (o.publicOnly) { try { await assertPublicHost(url) } catch (e) { report.skipped.push({ url, why: e.message }); continue } }
      if (o.signal && o.signal.aborted) { report.aborted = true; break }
      audited++
      const page = { url, title: '', results: [] }
      if (o.onPage) o.onPage(page, 'start')
      let discovered = []
      for (const [wi, width] of o.widths.entries()) {
        const b = await browserFor(width)
        let opened
        try { opened = await b.open(url, o.timeout) } catch (e) { page.results.push({ width, error: e.message }); continue }
        if (!/html/i.test(opened.type)) { report.skipped.push({ url, why: `content type ${opened.type}` }); page.results = []; break }
        if (!sameOrigin(opened.url, url)) { report.skipped.push({ url, why: `redirected off-site to ${opened.url}` }); page.results = []; break }
        if (o.publicOnly && opened.url !== url) { try { await assertPublicHost(opened.url) } catch (e) { report.skipped.push({ url, why: e.message }); page.results = []; break } }
        page.title = opened.title
        if (o.html) await b.evaluate(`document.documentElement.setAttribute(${JSON.stringify(o.html[0])}, ${JSON.stringify(o.html[1])}); true`)
        if (o.list) { if (wi === 0) discovered = await b.evaluate(LINKS); continue }
        await b.evaluate(axeSource + '; true')
        const axe = await b.evaluate(AXE_RUN(o.tags))
        page.results.push({ width, violations: axe.violations, incomplete: axe.incomplete })
        if (wi === 0 && o.crawl) discovered = await b.evaluate(LINKS)
        if (!o.quiet) log(`${url} @${width}: ${axe.violations.length} rule${axe.violations.length === 1 ? '' : 's'} / ${axe.violations.reduce((n, v) => n + v.nodes.length, 0)} nodes failing`)
      }
      if (o.reflow && page.results.length) {
        const b = await browserFor(320)
        try {
          const opened = await b.open(url, o.timeout)
          if (o.html) await b.evaluate(`document.documentElement.setAttribute(${JSON.stringify(o.html[0])}, ${JSON.stringify(o.html[1])}); true`)
          if (/html/i.test(opened.type)) { page.reflow = await b.evaluate(REFLOW); if (!o.quiet && (page.reflow.overflow || page.reflow.clipped.length)) log(`${url} @320 reflow: overflow ${page.reflow.overflow}px, ${page.reflow.clipped.length} clipped`) }
        } catch (e) { page.reflow = { error: e.message } }
      }
      if (o.list && o.crawl) console.log(url)
      if (page.results.length || o.list) report.pages.push(page)
      if (o.onPage) o.onPage(page, 'done')
      if (o.onQueue) o.onQueue(audited, queue.length)
      if (o.crawl && depth < o.depth) {
        for (const href of discovered) {
          const n = normalizeUrl(href, url)
          if (!n || seen.has(n) || !sameOrigin(n, url) || !looksLikePage(n)) continue
          seen.add(n); queue.push({ url: n, depth: depth + 1 })
        }
      }
      if (o.delay) await sleep(o.delay)
    }
    if (queue.length) report.capped = { atPages: o.maxPages, left: queue.length }
  } finally {
    for (const b of browsers.values()) await b.close()
    if (egress) { report.refused = egress.refused; await egress.close() }
  }
  if (o.list) return { report, exit: 0 }
  if (!report.pages.length) {
    const why = report.skipped.map((k) => `  ${k.url} — ${k.why}`).join('\n')
    throw new Error(`no page was audited${why ? ':\n' + why : ''}`)
  }

  report.summary = summarize(report)
  if (o.json) writeFileSync(o.json, JSON.stringify(report, null, 1))
  if (o.report) writeFileSync(o.report, renderHtml(report))
  const found = report.summary.violationNodes > 0 || report.summary.reflowPages > 0
  return { report, exit: found && o.failOn === 'any' ? 1 : 0 }
}

export function summarize(report) {
  const byRule = new Map()
  let violationNodes = 0, reflowPages = 0, errors = 0
  for (const p of report.pages) {
    for (const r of p.results) {
      if (r.error) { errors++; continue }
      for (const v of r.violations) {
        violationNodes += v.nodes.length
        const e = byRule.get(v.id) || { id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl, tags: v.tags, nodes: 0, pages: new Set() }
        e.nodes += v.nodes.length; e.pages.add(p.url); byRule.set(v.id, e)
      }
    }
    if (p.reflow && !p.reflow.error && (p.reflow.overflow > 0 || p.reflow.clipped.length)) reflowPages++
  }
  const rules = [...byRule.values()].map((e) => ({ ...e, pages: e.pages.size })).sort((a, b) => b.nodes - a.nodes)
  return { pages: report.pages.length, widths: report.options.widths, violationNodes, rules, reflowPages, errors, skipped: report.skipped.length }
}

export function formatSummary(report) {
  const s = report.summary
  const lines = [`${s.pages} page${s.pages === 1 ? '' : 's'} at ${s.widths.join(', ')}px — ${s.violationNodes} node${s.violationNodes === 1 ? '' : 's'} failing across ${s.rules.length} rule${s.rules.length === 1 ? '' : 's'}${report.options.reflow ? `; reflow problems on ${s.reflowPages}` : ''}${s.errors ? `; ${s.errors} page load${s.errors === 1 ? '' : 's'} failed` : ''}${s.skipped ? `; ${s.skipped} skipped` : ''}${report.refused ? `; ${report.refused} request${report.refused === 1 ? '' : 's'} to non-public addresses refused` : ''}${report.capped ? `; stopped at ${report.capped.atPages} pages with ${report.capped.left} left` : ''}.`]
  for (const r of s.rules) lines.push(`  ${String(r.nodes).padStart(5)}  ${r.id.padEnd(32)} ${r.impact.padEnd(9)} ${r.pages} page${r.pages === 1 ? '' : 's'}  ${r.help}`)
  return lines.join('\n')
}

// ── the HTML report ─────────────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export function renderHtml(report) {
  const s = report.summary || summarize(report)
  const host = (() => { try { return new URL(report.pages[0]?.url || 'http://-').host } catch { return '' } })()
  const when = new Date(report.generated).toUTCString()
  const ruleSections = s.rules.map((r) => {
    const rows = []
    for (const p of report.pages) for (const res of p.results) if (!res.error) for (const v of res.violations) if (v.id === r.id) for (const n of v.nodes) rows.push(`<tr><td><a href="${esc(p.url)}">${esc(p.url)}</a></td><td>${res.width}</td><td><code>${esc(n.target)}</code></td><td><pre>${esc(n.fix)}</pre></td></tr>`)
    return `<section aria-labelledby="r-${esc(r.id)}"><h3 id="r-${esc(r.id)}">${esc(r.id)} <span class="impact ${esc(r.impact)}">${esc(r.impact)}</span></h3>
<p>${esc(r.help)}. ${r.nodes} element${r.nodes === 1 ? '' : 's'} on ${r.pages} page${r.pages === 1 ? '' : 's'}. <a href="${esc(r.helpUrl)}">How to fix it (axe-core)</a>. WCAG: ${esc(r.tags.filter((t) => /^wcag\d{3,}$/.test(t)).map((t) => t.replace(/^wcag(\d)(\d)(\d+)$/, '$1.$2.$3')).join(', ') || 'A/AA')}.</p>
<table><caption>Where ${esc(r.id)} fails</caption><thead><tr><th scope="col">Page</th><th scope="col">Width</th><th scope="col">Element</th><th scope="col">What to change</th></tr></thead><tbody>${rows.join('')}</tbody></table></section>`
  }).join('\n')
  const pageRows = report.pages.map((p) => {
    const counts = p.results.map((res) => res.error ? `${res.width}px: failed to load (${esc(res.error)})` : `${res.width}px: ${res.violations.reduce((n, v) => n + v.nodes.length, 0)}`).join('<br>')
    const reflow = p.reflow ? (p.reflow.error ? 'not checked' : (p.reflow.overflow ? `${p.reflow.overflow}px sideways overflow` : 'fits') + (p.reflow.clipped.length ? `; ${p.reflow.clipped.length} clipped under text spacing` : '')) : ''
    return `<tr><td><a href="${esc(p.url)}">${esc(p.title || p.url)}</a><br><small>${esc(p.url)}</small></td><td>${counts}</td>${report.options.reflow ? `<td>${reflow}</td>` : ''}</tr>`
  }).join('')
  const skipped = report.skipped.length ? `<h2 id="skipped">Skipped</h2><ul>${report.skipped.map((k) => `<li>${esc(k.url)} — ${esc(k.why)}</li>`).join('')}</ul>` : ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WCAG sweep — ${esc(host)}</title>
<style>
:root{color-scheme:light dark;--ink:#1a2d42;--bg:#fff;--line:#d5dde6;--muted:#4d5c6b;--crit:#8b1a1a;--ser:#8a4b00;--mod:#5b5b00;--min:#2a5580}
@media(prefers-color-scheme:dark){:root{--ink:#e8eef5;--bg:#0f1a26;--line:#2d3b4b;--muted:#aab6c4;--crit:#ff9a9a;--ser:#ffc98a;--mod:#e6e68a;--min:#9ec4ea}}
body{margin:0;padding:1.5rem 1rem 4rem;font:16px/1.5 system-ui,sans-serif;color:var(--ink);background:var(--bg);max-width:72rem;margin-inline:auto}
h1{font-size:1.6rem;margin:.2rem 0}h2{margin-top:2.2rem;border-top:1px solid var(--line);padding-top:1rem}h3{margin:1.8rem 0 .3rem}
table{border-collapse:collapse;width:100%;margin:.6rem 0}th,td{text-align:left;vertical-align:top;border:1px solid var(--line);padding:.4rem .5rem;font-size:.92rem}th{background:color-mix(in srgb,var(--ink) 6%,var(--bg))}
caption{text-align:left;font-weight:600;padding:.3rem 0}pre{white-space:pre-wrap;margin:0;font-size:.85rem}code{font-size:.85rem;overflow-wrap:anywhere}
.impact{font-size:.75rem;text-transform:uppercase;letter-spacing:.05em;padding:.1rem .45rem;border:1px solid currentColor;border-radius:.3rem;vertical-align:middle}
.critical{color:var(--crit)}.serious{color:var(--ser)}.moderate{color:var(--mod)}.minor{color:var(--min)}
.lede{color:var(--muted)}.ok{font-weight:600}a{color:inherit}
.skip{position:absolute;left:-999px}.skip:focus{position:static}
</style>
</head>
<body>
<a class="skip" href="#summary">Skip to summary</a>
<header><h1>WCAG 2.2 sweep of ${esc(host)}</h1><p class="lede">${esc(when)} · ${s.pages} page${s.pages === 1 ? '' : 's'} at ${esc(s.widths.join(', '))}px · ${esc(report.axe)} · rules ${esc(report.options.tags.join(', '))}${report.options.html ? ` · with <code>&lt;html ${esc(report.options.html[0])}="${esc(report.options.html[1])}"&gt;</code>` : ''}</p></header>
<main>
<h2 id="summary">Summary</h2>
${s.violationNodes === 0 ? `<p class="ok">No violations of the WCAG 2.2 A and AA rules axe-core can test, on any page at any width.</p>` : `<p><strong>${s.violationNodes}</strong> element${s.violationNodes === 1 ? '' : 's'} fail${s.violationNodes === 1 ? 's' : ''} across <strong>${s.rules.length}</strong> rule${s.rules.length === 1 ? '' : 's'}.</p>`}
${report.options.reflow ? `<p>Reflow at 320px: ${s.reflowPages === 0 ? 'every page fits and nothing clips under WCAG text spacing.' : `<strong>${s.reflowPages}</strong> page${s.reflowPages === 1 ? '' : 's'} with sideways overflow or clipped text.`}</p>` : ''}
${report.refused ? `<p>The pages asked for ${report.refused} resource${report.refused === 1 ? '' : 's'} at addresses that are not on the public internet. Those were refused and not loaded, so anything they would have added to a page was not audited.</p>` : ''}
${report.capped ? `<p>The sweep stopped at ${report.capped.atPages} pages with ${report.capped.left} more discovered. Raise <code>--max-pages</code> to go further.</p>` : ''}
<p class="lede">What a machine can test is necessary, not sufficient: keyboard order, meaningful names, captions and the sense of the text still need a person. A clean run here means the automated half is clean.</p>
${s.rules.length ? `<table><caption>By rule</caption><thead><tr><th scope="col">Rule</th><th scope="col">Impact</th><th scope="col">Elements</th><th scope="col">Pages</th><th scope="col">What it means</th></tr></thead><tbody>${s.rules.map((r) => `<tr><td><a href="#r-${esc(r.id)}">${esc(r.id)}</a></td><td class="${esc(r.impact)}">${esc(r.impact)}</td><td>${r.nodes}</td><td>${r.pages}</td><td>${esc(r.help)}</td></tr>`).join('')}</tbody></table>` : ''}
<h2 id="pages">Pages</h2>
<table><caption>Failing elements per page and width</caption><thead><tr><th scope="col">Page</th><th scope="col">Failing elements</th>${report.options.reflow ? '<th scope="col">Reflow at 320px</th>' : ''}</tr></thead><tbody>${pageRows}</tbody></table>
${s.rules.length ? `<h2 id="findings">Findings</h2>${ruleSections}` : ''}
${skipped}
</main>
<footer><p class="lede">Generated by <a href="https://github.com/evomedia-net/evo.snippets/tree/main/wcag-sweep">wcag-sweep ${esc(VERSION)}</a>, an evomedia.net snippet, MIT. axe-core is © Deque Systems, MPL-2.0.</p></footer>
</body>
</html>
`
}

// ── main ────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  let o
  try { o = parseArgs(process.argv.slice(2)) } catch (e) { console.error(`wcag-sweep: ${e.message}`); process.exit(2) }
  if (o.help) { console.log(HELP); process.exit(0) }
  if (o.version) { console.log(VERSION); process.exit(0) }
  try {
    const { report, exit } = await sweep(o)
    if (!o.list) {
      console.log(formatSummary(report))
      if (o.json) console.log(`JSON: ${o.json}`)
      if (o.report) console.log(`Report: ${o.report}`)
    }
    process.exit(exit)
  } catch (e) {
    console.error(`wcag-sweep: ${e.message}`)
    process.exit(2)
  }
}
