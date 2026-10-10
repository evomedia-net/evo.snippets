// evomedia.net Snippets — https://github.com/evomedia-net/evo.snippets
// Created by Kelly Michels · kelly@evomedia.net
// Licensed under the MIT License. See LICENSE.
//
// Unit tests for the parts of wcag-sweep that need no browser: argument
// parsing, URL canonicalisation, the public-address guard, the summary and
// the HTML report. Run with `node --test` from this folder.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs, UsageError, normalizeUrl, sameOrigin, looksLikePage, isPrivateAddress, assertPublicHost, chromeCandidates, summarize, formatSummary, renderHtml, AXE_SHA256, AXE_VERSION, DEFAULT_TAGS, HELP } from './wcag-sweep.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

test('arguments: positional URLs and every option', () => {
  const o = parseArgs(['https://a.test/', '--crawl', '--max-pages', '5', '--depth', '1', '--width', '1280, 375', '--html', 'data-a11y=on', '--tags', 'wcag2a,wcag2aa', '--reflow', '--public-only', '--json', 'r.json', '--report', 'r.html', '--quiet', '--fail-on', 'none', '--chrome', 'C:/x/chrome.exe', '--delay', '0'])
  assert.deepEqual(o.urls, ['https://a.test/'])
  assert.equal(o.crawl, true); assert.equal(o.maxPages, 5); assert.equal(o.depth, 1)
  assert.deepEqual(o.widths, [1280, 375]); assert.deepEqual(o.html, ['data-a11y', 'on'])
  assert.deepEqual(o.tags, ['wcag2a', 'wcag2aa']); assert.equal(o.reflow, true); assert.equal(o.publicOnly, true)
  assert.equal(o.json, 'r.json'); assert.equal(o.report, 'r.html'); assert.equal(o.quiet, true); assert.equal(o.failOn, 'none'); assert.equal(o.delay, 0)
})

test('arguments: defaults are WCAG 2.2 A/AA at 1280px, 25 pages, depth 2, fail on any', () => {
  const o = parseArgs(['https://a.test/'])
  assert.deepEqual(o.tags, DEFAULT_TAGS); assert.deepEqual(o.widths, [1280]); assert.equal(o.maxPages, 25); assert.equal(o.depth, 2); assert.equal(o.failOn, 'any'); assert.equal(o.publicOnly, false)
})

test('arguments: every help spelling, and usage errors name the flag', () => {
  for (const h of ['-help', '--help', '-h', '--h', '-?']) assert.equal(parseArgs([h]).help, true)
  assert.throws(() => parseArgs(['--width', 'wide']), UsageError)
  assert.throws(() => parseArgs(['--html', 'nope']), UsageError)
  assert.throws(() => parseArgs(['--fail-on', 'sometimes']), UsageError)
  assert.throws(() => parseArgs(['--bogus']), /unknown option --bogus/)
  assert.throws(() => parseArgs(['--json']), /needs a value/)
  assert.match(HELP, /--public-only/)
})

test('urls: one spelling per page', () => {
  assert.equal(normalizeUrl('https://A.test/index.html#top'), 'https://a.test/')
  assert.equal(normalizeUrl('https://a.test/docs/index.htm'), 'https://a.test/docs/')
  assert.equal(normalizeUrl('https://a.test'), 'https://a.test/')
  assert.equal(normalizeUrl('/about.html', 'https://a.test/blog/'), 'https://a.test/about.html')
  assert.equal(normalizeUrl('mailto:x@a.test'), null)
  assert.equal(normalizeUrl('javascript:void(0)', 'https://a.test/'), null)
  assert.equal(normalizeUrl('not a url'), null)
})

test('urls: same origin and page-shaped', () => {
  assert.equal(sameOrigin('https://a.test/x', 'https://a.test/y'), true)
  assert.equal(sameOrigin('https://a.test/x', 'https://b.test/x'), false)
  assert.equal(sameOrigin('https://a.test/x', 'http://a.test/x'), false)
  assert.equal(looksLikePage('https://a.test/page'), true)
  assert.equal(looksLikePage('https://a.test/page.html'), true)
  for (const f of ['brochure.pdf', 'photo.JPG', 'style.css', 'app.js', 'data.json', 'sitemap.xml', 'robots.txt', 'clip.mp4']) assert.equal(looksLikePage(`https://a.test/${f}`), false, f)
})

test('guard: private, loopback, link-local and CGNAT ranges, v4 and v6', () => {
  for (const ip of ['10.0.0.1', '172.16.0.1', '172.31.255.254', '192.168.50.1', '127.0.0.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', 'fc00::1', 'fd12::1', 'fe80::1', '::ffff:192.168.1.2', 'not-an-ip']) assert.equal(isPrivateAddress(ip), true, ip)
  for (const ip of ['8.8.8.8', '52.1.28.159', '172.32.0.1', '100.128.0.1', '2606:4700::1111', '::ffff:8.8.8.8']) assert.equal(isPrivateAddress(ip), false, ip)
})

test('guard: localhost names and literal private hosts are refused without a lookup', async () => {
  await assert.rejects(assertPublicHost('http://localhost:5193/'), /not a public host/)
  await assert.rejects(assertPublicHost('http://dev.localhost/'), /not a public host/)
  await assert.rejects(assertPublicHost('http://router.local/'), /not a public host/)
  await assert.rejects(assertPublicHost('http://192.168.50.1/'), /not public/)
  await assert.rejects(assertPublicHost('http://[::1]/'), /not public/)
})

test('browser: candidates per platform, and the environment override comes first', () => {
  const win = chromeCandidates('win32', { PROGRAMFILES: 'C:/PF', 'PROGRAMFILES(X86)': 'C:/PF86', LOCALAPPDATA: 'C:/LA' })
  assert.ok(win.some((p) => /Google.Chrome.Application.chrome\.exe$/.test(p)))
  assert.ok(win.some((p) => /Microsoft.Edge.Application.msedge\.exe$/.test(p)))
  assert.equal(chromeCandidates('darwin', {})[0], '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
  assert.ok(chromeCandidates('linux', { PATH: '/usr/bin:/snap/bin' }).includes('/usr/bin/chromium'))
  assert.equal(chromeCandidates('linux', { PATH: '', WCAG_SWEEP_CHROME: '/opt/chrome' })[0], '/opt/chrome')
})

test('vendored axe-core matches the pinned version and checksum', () => {
  const src = readFileSync(join(HERE, 'vendor', 'axe-core', 'axe.min.js'), 'utf8')
  assert.equal(createHash('sha256').update(src).digest('hex'), AXE_SHA256)
  assert.match(src, new RegExp(`axe v${AXE_VERSION.replace(/\./g, '\\.')}`)) // the banner Deque ships
  assert.ok(src.includes(`axe.version="${AXE_VERSION}"`))
  assert.match(readFileSync(join(HERE, 'vendor', 'axe-core', 'VERSION.txt'), 'utf8'), new RegExp(`${AXE_VERSION}[\\s\\S]*${AXE_SHA256}`))
})

const sample = () => ({
  tool: 'wcag-sweep', version: 'test', generated: '2026-10-09T00:00:00.000Z', axe: 'axe-core test',
  options: { widths: [1280, 375], tags: DEFAULT_TAGS, html: null, crawl: false, maxPages: 25, depth: 2, reflow: true, publicOnly: false },
  skipped: [{ url: 'https://a.test/brochure.pdf', why: 'not a page by its extension' }],
  pages: [
    { url: 'https://a.test/', title: 'Home', results: [
      { width: 1280, violations: [{ id: 'color-contrast', impact: 'serious', help: 'Elements must meet minimum color contrast ratio thresholds', helpUrl: 'https://dequeuniversity.com/rules/axe/4.11/color-contrast', tags: ['wcag2aa', 'wcag143'], nodes: [{ target: '.hint', html: '<span class="hint">x</span>', fix: 'Fix any of the following:\n  Element has insufficient color contrast of 3.4' }] }], incomplete: [] },
      { width: 375, violations: [], incomplete: [] },
    ], reflow: { overflow: 0, clipped: [] } },
    { url: 'https://a.test/about', title: 'About <us>', results: [{ width: 1280, violations: [], incomplete: [] }, { width: 375, error: 'timed out after 30000 ms' }], reflow: { overflow: 42, clipped: [{ target: 'li.card', text: 'August' }] } },
  ],
})

test('summary: counts nodes, rules, pages, reflow problems, errors and skips', () => {
  const r = sample(); r.summary = summarize(r)
  assert.equal(r.summary.pages, 2); assert.equal(r.summary.violationNodes, 1); assert.equal(r.summary.rules.length, 1)
  assert.equal(r.summary.rules[0].pages, 1); assert.equal(r.summary.reflowPages, 1); assert.equal(r.summary.errors, 1); assert.equal(r.summary.skipped, 1)
  const text = formatSummary(r)
  assert.match(text, /2 pages at 1280, 375px — 1 node failing across 1 rule; reflow problems on 1; 1 page load failed; 1 skipped\./)
  assert.match(text, /color-contrast\s+serious\s+1 page/)
})

test('report: self-contained, escaped, and says what it checked', () => {
  const r = sample(); r.summary = summarize(r)
  const html = renderHtml(r)
  assert.match(html, /^<!DOCTYPE html>/)
  assert.doesNotMatch(html, /<script/)
  assert.doesNotMatch(html, /<link/)
  assert.match(html, /<title>WCAG sweep — a\.test<\/title>/)
  assert.match(html, /About &lt;us&gt;/)                      // titles are escaped
  assert.match(html, /id="r-color-contrast"/)                 // a section per rule
  assert.match(html, /WCAG: 1\.4\.3/)                         // the criterion, from the axe tag
  assert.match(html, /42px sideways overflow; 1 clipped under text spacing/)
  assert.match(html, /timed out after 30000 ms/)
  assert.match(html, /brochure\.pdf — not a page by its extension/)
  assert.match(html, /Skip to summary/)
  const clean = sample(); clean.pages[0].results[0].violations = []; clean.pages[1].reflow = { overflow: 0, clipped: [] }; clean.summary = summarize(clean)
  assert.match(renderHtml(clean), /No violations of the WCAG 2\.2 A and AA rules/)
})
