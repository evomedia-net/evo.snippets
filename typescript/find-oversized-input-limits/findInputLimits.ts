// Evomedia.net Snippets — https://github.com/evomedia-net/evo.snippets
// Created by Kelly Michels · dev@evomedia.net
// Licensed under the MIT License. See LICENSE.

/**
 * Find user-input character limits above a threshold (default 2500) in any codebase.
 *
 * One scanner, every common fullstack. Recognizes the places a maximum character
 * count gets declared across HTML/JSX/Angular/Vue, Python (Django, DRF, Pydantic,
 * SQLAlchemy, WTForms, marshmallow), TypeScript/JS (Zod, Yup, Joi, class-validator,
 * TypeORM, Sequelize, Mongoose, Prisma), PHP (Laravel, Symfony, Doctrine),
 * Ruby on Rails, Go (validator tags, GORM), Java/Spring (Bean Validation, JPA),
 * C#/.NET (DataAnnotations, EF Core), raw SQL DDL, and JSON Schema / OpenAPI.
 *
 * This is the TypeScript twin of the Python snippet in ../../python. Same rules,
 * same flags, same output — pick whichever runtime your machine already has.
 *
 * Requires Node 22.6+ (with --experimental-strip-types) or Node 23+, which runs
 * TypeScript directly. The launchers handle that detection for you.
 */

import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

/** Default threshold: report any declared limit strictly greater than this. */
const DEFAULT_LIMIT = 2500;

/** Files larger than this are generated data, not hand-written source. */
const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** Lines longer than this are minified or bundled output. */
const MAX_LINE_CHARS = 2000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One declared length limit that exceeds the threshold. */
export interface Finding {
  /** Absolute path while scanning; rewritten relative to the scan root on output. */
  path: string;
  /** 1-indexed line number. */
  line: number;
  /** The declared cap, or null for an unbounded column (TEXT / VARCHAR(MAX)). */
  limit: number | null;
  /** Which rule matched, e.g. "class-validator" — shown so a finding is explainable. */
  kind: string;
  /** The input this limit belongs to, when the line names one. */
  field: string | null;
  /** The source line, trimmed and capped, so the report is readable on its own. */
  snippet: string;
  /** "medium" marks patterns that can legitimately mean something else. */
  confidence: "high" | "medium";
}

export interface ScanOptions {
  limit?: number;
  /** File extensions to read, with the leading dot. Defaults to every supported type. */
  exts?: string[];
  includeUnbounded?: boolean;
  highOnly?: boolean;
}

interface Rule {
  kind: string;
  /**
   * Must expose a named group `n` holding the numeric limit (or `n2` as a second
   * alternative), and may expose `field` to name the input. Needs the `g` flag
   * because every rule is run with `matchAll`.
   */
  pattern: RegExp;
  confidence: "high" | "medium";
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/**
 * Order matters. Dedupe keeps the first rule that matches a given (line, value)
 * pair, so the high-confidence, specifically-named rules are listed before the
 * broad fallbacks — otherwise every Django `max_length=` would be reported as a
 * generic "length constant".
 */
const RULES: Rule[] = [
  // -- markup / templates: HTML, JSX, Angular, Vue, Svelte, Blade, ERB -------
  // Covers plain `maxlength="4000"`, Angular's `[maxlength]="4000"`, Vue's
  // `:maxlength="4000"`, Mongoose's `maxlength: 4000`, and JSON Schema's
  // `"maxLength": 4000` — the optional quote/bracket/colon salad before the
  // number is what makes one rule cover all five.
  {
    kind: "html maxlength",
    pattern: /(?:\[|:|v-bind:)?maxlength["']?\]?\s*[:=]\s*["'{]?\s*(?<n>\d+)/gi,
    confidence: "high",
  },
  // JSX/TSX braces: maxLength={4000}. Case-sensitive on purpose — the attribute
  // rule above already handles the lowercase HTML spelling.
  { kind: "jsx maxLength", pattern: /maxLength\s*=\s*[{"']\s*(?<n>\d+)/g, confidence: "high" },

  // -- Python: Django, DRF, Pydantic, WTForms, marshmallow ------------------
  { kind: "max_length kwarg", pattern: /\bmax_?length\s*=\s*(?<n>\d+)/gi, confidence: "high" },
  // WTForms/marshmallow `Length(min=1, max=4000)` — the min is optional.
  {
    kind: "Length(max=n)",
    pattern: /Length\s*\(\s*(?:min\s*=\s*\d+\s*,\s*)?max\s*=\s*(?<n>\d+)/g,
    confidence: "high",
  },

  // -- TypeScript/JS decorators & ORMs --------------------------------------
  // class-validator (NestJS DTOs). `@Length(0, 4000)` puts the max second, so
  // the optional leading `\d+,` skips the min without capturing it.
  {
    kind: "class-validator",
    pattern: /@(?:MaxLength|Length)\s*\(\s*(?:\d+\s*,\s*)?(?<n>\d+)/g,
    confidence: "high",
  },
  { kind: "Validators.maxLength", pattern: /Validators\.maxLength\s*\(\s*(?<n>\d+)/g, confidence: "high" },
  { kind: "prisma @db.VarChar", pattern: /@db\.(?:VarChar|Char|Text)\s*\(\s*(?<n>\d+)/g, confidence: "high" },

  // -- PHP: Laravel validation, Doctrine, Symfony ---------------------------
  // Laravel pipe rules: 'required|string|max:5500'. The optional `[^"']*\|`
  // lets the rule sit anywhere in the pipe chain, not just at the start.
  { kind: "laravel max: rule", pattern: /["'](?:[^"']*\|)?max:(?<n>\d+)/g, confidence: "high" },
  // Migration column: $table->string('summary', 4200) — the name is the field.
  {
    kind: "laravel schema string()",
    pattern: /->(?:string|char)\s*\(\s*["'](?<field>\w+)["']\s*,\s*(?<n>\d+)/g,
    confidence: "high",
  },
  {
    kind: "symfony/doctrine length",
    pattern: /(?:@Assert\\Length\s*\(|@ORM\\Column\s*\().*?\bmax(?:Length)?\s*[:=]\s*["']?(?<n>\d+)/gi,
    confidence: "high",
  },

  // -- Ruby on Rails ---------------------------------------------------------
  { kind: "rails length maximum", pattern: /(?:length\s*:\s*\{[^}]*?maximum\s*:\s*|maximum\s*:\s*)(?<n>\d+)/g, confidence: "high" },
  // Migration `limit: 3300`. Medium because `limit:` is a common option name
  // that has nothing to do with string length in plenty of other contexts.
  { kind: "rails limit:", pattern: /\blimit\s*:\s*(?<n>\d+)/g, confidence: "medium" },

  // -- Go: validator/binding struct tags, GORM -------------------------------
  { kind: "go validate tag", pattern: /(?:validate|binding)\s*:\s*"[^"]*?\bmax\s*=\s*(?<n>\d+)/g, confidence: "high" },
  // Two spellings in one tag, so two capture groups; the scanner reads `n` then
  // falls back to `n2`.
  {
    kind: "gorm size/type tag",
    pattern: /gorm\s*:\s*"[^"]*?(?:size\s*:\s*(?<n>\d+)|type\s*:\s*varchar\s*\(\s*(?<n2>\d+)\s*\))/gi,
    confidence: "high",
  },

  // -- Java / Spring: Bean Validation, JPA -----------------------------------
  { kind: "@Size(max=n)", pattern: /@(?:Size|Length)\s*\(\s*(?:min\s*=\s*\d+\s*,\s*)?max\s*=\s*(?<n>\d+)/g, confidence: "high" },
  { kind: "@Column(length=n)", pattern: /@Column\s*\([^)]*?\blength\s*=\s*(?<n>\d+)/g, confidence: "high" },

  // -- C# / .NET: DataAnnotations, EF Core -----------------------------------
  { kind: "[MaxLength/StringLength]", pattern: /\[\s*(?:MaxLength|StringLength)\s*\(\s*(?<n>\d+)/g, confidence: "high" },
  { kind: "EF HasMaxLength", pattern: /\.HasMaxLength\s*\(\s*(?<n>\d+)/g, confidence: "high" },

  // -- SQL DDL / ORM column types (all languages) ----------------------------
  {
    kind: "varchar/String(n)",
    pattern: /\b(?:VARCHAR2?|NVARCHAR|CHARACTER\s+VARYING|NCHAR|DataTypes\.STRING|String|Unicode|VarChar)\s*\(\s*(?<n>\d+)/gi,
    confidence: "high",
  },

  // -- schema/config: TypeORM, Sequelize, OpenAPI ----------------------------
  // Medium: `length: 6000` is a column width in an ORM options object and an
  // array size almost everywhere else.
  { kind: "column length option", pattern: /\blength\s*[:=]\s*(?<n>\d+)/g, confidence: "medium" },

  // -- ambiguous but worth surfacing -----------------------------------------
  // Zod/Yup/Joi/Valibot. `z.string().max(n)` is a character limit;
  // `z.array(x).max(n)` is an element count. Same syntax, so: medium.
  { kind: "validator .max()", pattern: /\.(?:max|maxLength)\s*\(\s*(?<n>\d+)/g, confidence: "medium" },
  // Hand-rolled constants: MAX_BODY_LENGTH = 5000, maxChars: 5000, charLimit = 5000.
  {
    kind: "length constant",
    pattern:
      /(?<field>\b\w*(?:MAX|max|Max)\w*(?:LEN|LENGTH|Length|length|CHARS|Chars|chars|SIZE|Size|size)\w*|\b\w*(?:char|CHAR|Char)\w*(?:limit|LIMIT|Limit)\w*)\s*[:=]\s*(?<n>\d+)\b/g,
    confidence: "medium",
  },
];

/**
 * Column types with no declared ceiling. These are the *opposite* problem from
 * an oversized limit — no limit at all — so they are opt-in via --include-unbounded
 * rather than mixed into the default output.
 */
const UNBOUNDED =
  /\b(?:LONGTEXT|MEDIUMTEXT|TEXT\b|CLOB|VARCHAR\s*\(\s*MAX\s*\)|NVARCHAR\s*\(\s*MAX\s*\)|models\.TextField|@db\.Text|\bText\s*\(\s*\))/i;

/** Nearest identifier on the same line, used to label an otherwise-anonymous limit. */
const FIELD_HINT =
  /(?:name|id|field|label|formControlName|v-model|ng-model)\s*[:=]\s*["'{]?(?<field>[\w.\-]+)/i;

// ---------------------------------------------------------------------------
// Language groups
// ---------------------------------------------------------------------------

/**
 * The names usable as +name / -name on the command line. Kept identical to the
 * Python snippet so the two tools take the same command line.
 *
 * A group is about the file being *scanned*, not the runtime running the scan.
 */
const EXT_GROUPS: Record<string, string[]> = {
  py: [".py", ".pyi"],
  ts: [".ts", ".tsx", ".mts", ".cts"],
  js: [".js", ".jsx", ".mjs", ".cjs"],
  web: [".html", ".htm", ".vue", ".svelte", ".astro"],
  tpl: [".jinja", ".jinja2", ".j2", ".twig", ".erb", ".haml", ".hbs", ".ejs", ".liquid", ".razor", ".cshtml", ".aspx"],
  php: [".php"],
  rb: [".rb", ".rake"],
  go: [".go"],
  java: [".java", ".kt", ".kts", ".scala"],
  cs: [".cs", ".vb"],
  swift: [".swift"],
  dart: [".dart"],
  rs: [".rs"],
  ex: [".ex", ".exs"],
  sql: [".sql"],
  prisma: [".prisma"],
  gql: [".graphql", ".gql", ".proto"],
  json: [".json"],
  yaml: [".yml", ".yaml"],
  toml: [".toml"],
  xml: [".xml", ".xsd"],
};

// Convenience umbrellas, defined after the base groups so they can reuse them.
EXT_GROUPS.frontend = [...EXT_GROUPS.ts, ...EXT_GROUPS.js, ...EXT_GROUPS.web, ...EXT_GROUPS.tpl];
EXT_GROUPS.schema = [...EXT_GROUPS.sql, ...EXT_GROUPS.prisma, ...EXT_GROUPS.gql];
EXT_GROUPS.config = [...EXT_GROUPS.json, ...EXT_GROUPS.yaml, ...EXT_GROUPS.toml, ...EXT_GROUPS.xml];

const SOURCE_EXTS = new Set(Object.values(EXT_GROUPS).flat());

/** Directories that never hold first-party source. Pruned before descending. */
const SKIP_DIRS = new Set([
  ".git", ".hg", ".svn", ".idea", ".vscode", ".claude",
  ".venv", "venv", "env", ".env", "virtualenv", "site-packages", ".tox",
  "node_modules", "bower_components", "vendor", "packages",
  "__pycache__", ".mypy_cache", ".pytest_cache", ".ruff_cache", ".cache",
  ".next", ".nuxt", ".svelte-kit", ".turbo", ".angular", ".output",
  "dist", "build", "out", "target", "bin", "obj",
  "coverage", "htmlcov", "storybook-static", ".terraform", ".gradle",
  "migrations_backup", "backups", "archive", "temp", "tmp",
]);

/** Generated or vendored files that pass the extension filter but are still noise. */
const SKIP_FILE_PATTERNS = [
  ".min.js", ".min.css", ".bundle.js", ".chunk.js", ".d.ts",
  "-lock.json", ".lock", ".map", ".snap",
];

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/**
 * Turn +name / -name selectors into a concrete set of file extensions.
 *
 * An empty `include` means "every supported language". Names are matched against
 * EXT_GROUPS first and fall back to a literal extension, so `+kt` works without
 * being a defined group.
 */
export function resolveExtensions(include: string[] = [], exclude: string[] = []): Set<string> {
  const expand = (names: string[]): Set<string> => {
    const out = new Set<string>();
    for (const name of names) {
      const key = name.toLowerCase().replace(/^\.+/, "");
      if (key in EXT_GROUPS) {
        for (const ext of EXT_GROUPS[key]) out.add(ext);
      } else {
        out.add(`.${key}`);
      }
    }
    return out;
  };

  const wanted = include.length ? expand(include) : new Set(SOURCE_EXTS);
  for (const ext of expand(exclude)) wanted.delete(ext);
  return wanted;
}

/** Walk `root`, yielding files whose extension is in `wanted` and pruning vendor dirs. */
function* walk(root: string, wanted: Set<string>): Generator<string> {
  // An explicitly named file is scanned whatever its extension — the user asked
  // for that file specifically, so the type filter should not veto it.
  if (statSync(root).isFile()) {
    yield root;
    return;
  }

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !entry.name.endsWith(".egg-info")) {
        yield* walk(full, wanted);
      }
    } else if (entry.isFile()) {
      if (SKIP_FILE_PATTERNS.some((suffix) => entry.name.endsWith(suffix))) continue;
      if (wanted.has(extname(entry.name).toLowerCase())) yield full;
    }
  }
}

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

/** Return every declared length limit in one file that exceeds `limit`. */
export function scanFile(
  path: string,
  limit = DEFAULT_LIMIT,
  includeUnbounded = false,
  prefilter?: RegExp,
): Finding[] {
  let raw: Buffer;
  try {
    if (statSync(path).size > MAX_FILE_BYTES) return [];
    raw = readFileSync(path);
  } catch {
    return []; // unreadable (permissions, race with a delete) — not worth failing the run
  }
  if (raw.subarray(0, 8192).includes(0)) return []; // NUL byte => binary

  // Any limit over N has at least as many digits as N, so a line without a digit
  // run that long cannot possibly match. Checking that once is far cheaper than
  // running 22 regexes, and it skips the overwhelming majority of lines.
  const digits = prefilter ?? new RegExp(`\\d{${String(limit).length},}`);

  const findings: Finding[] = [];
  const lines = raw.toString("utf8").split(/\r?\n/);

  lines.forEach((line, index) => {
    if (line.length > MAX_LINE_CHARS) return;
    const lineNo = index + 1;

    if (includeUnbounded && UNBOUNDED.test(line)) {
      findings.push({
        path, line: lineNo, limit: null, kind: "unbounded text column",
        field: null, snippet: line.trim().slice(0, 200), confidence: "medium",
      });
    }

    if (!digits.test(line)) return;

    // Dedupe per (line, value): several rules can legitimately match the same
    // number on one line (`max_length=4000` hits both the kwarg rule and the
    // constant rule). First match wins, but a later high-confidence rule may
    // upgrade an earlier medium one so the better label survives.
    const seen = new Map<number, Finding>();

    for (const { kind, pattern, confidence } of RULES) {
      pattern.lastIndex = 0; // shared regex objects carry state between files
      for (const match of line.matchAll(pattern)) {
        const rawValue = match.groups?.n ?? match.groups?.n2;
        if (!rawValue) continue;
        const value = Number(rawValue);
        if (!Number.isFinite(value) || value <= limit) continue;
        if (seen.get(value)?.confidence === "high") continue;

        seen.set(value, {
          path, line: lineNo, limit: value, kind,
          field: match.groups?.field ?? line.match(FIELD_HINT)?.groups?.field ?? null,
          snippet: line.trim().slice(0, 200),
          confidence,
        });
      }
    }

    findings.push(...seen.values());
  });

  return findings;
}

/**
 * Scan `root` and return every user-input length limit above `limit`.
 *
 * Sorted largest-limit-first (unbounded first), then by path and line, so the
 * worst offender is always the first thing you read.
 *
 * Findings with `confidence: "medium"` come from ambiguous patterns — `.max(n)`
 * may bound a number rather than a string length, and `length: n` may be an
 * array size. Pass `highOnly` to drop them.
 */
export function findOversizedInputLimits(root = ".", options: ScanOptions = {}): Finding[] {
  const { limit = DEFAULT_LIMIT, exts, includeUnbounded = false, highOnly = false } = options;
  const base = resolve(root);
  const wanted = exts
    ? new Set(exts.map((e) => (e.startsWith(".") ? e : `.${e}`).toLowerCase()))
    : new Set(SOURCE_EXTS);
  const prefilter = new RegExp(`\\d{${String(limit).length},}`);

  let results: Finding[] = [];
  for (const path of walk(base, wanted)) {
    results.push(...scanFile(path, limit, includeUnbounded, prefilter));
  }

  if (highOnly) results = results.filter((f) => f.confidence === "high");

  return results.sort(
    (a, b) =>
      // null (unbounded) sorts first by standing in as Infinity.
      (b.limit ?? Number.POSITIVE_INFINITY) - (a.limit ?? Number.POSITIVE_INFINITY) ||
      byCodepoint(toPosix(a.path), toPosix(b.path)) ||
      a.line - b.line,
  );
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const FORMATS = ["json", "csv", "md", "txt"] as const;
type Format = (typeof FORMATS)[number];
const DEFAULT_STEM = "oversized-limits";

/**
 * Codepoint order, deliberately not localeCompare: localeCompare folds case, so
 * "Model.cs" would sort next to "models.py" instead of before every lowercase
 * name. Codepoint order is what the Python twin's sorted() does, and matching it
 * is what keeps the two tools' output byte-identical.
 */
function byCodepoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Windows gives backslashes; the Python twin stores posix. Normalize to compare. */
function toPosix(path: string): string {
  return path.split("\\").join("/");
}

/** Paths are reported relative to the scan root, so reports stay portable. */
function rel(path: string, base?: string): string {
  if (!base) return path;
  const relative_ = relative(base, path);
  // A path outside the scan root produces "../.." — keep the absolute form then.
  return relative_ && !relative_.startsWith("..") ? relative_.split("\\").join("/") : path;
}

/** Report filename: 20260811-19-05-33-oversized-limits.json, or unstamped. */
export function defaultReportName(fmt: Format, stamp = true): string {
  if (!stamp) return `${DEFAULT_STEM}.${fmt}`;
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const ts =
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
  return `${ts}-${DEFAULT_STEM}.${fmt}`;
}

/** One console line per finding, plus the source line beneath it. */
function formatFinding(f: Finding, base?: string): string {
  const cap = f.limit === null ? "unbounded" : f.limit.toLocaleString("en-US");
  const name = f.field ? ` [${f.field}]` : "";
  const mark = f.confidence === "high" ? "" : "  (?)";
  return `${rel(f.path, base)}:${f.line}: ${cap.padStart(9)}  ${f.kind}${name}${mark}\n    ${f.snippet}`;
}

/** Quote a CSV field only when it needs it, doubling any embedded quotes. */
function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.split('"').join('""')}"` : s;
}

/** Serialize findings as json, csv, md, or txt. */
export function render(findings: Finding[], fmt: Format, base?: string): string {
  if (fmt === "json") {
    return JSON.stringify(findings.map((f) => ({ ...f, path: rel(f.path, base) })), null, 2);
  }

  if (fmt === "csv") {
    const rows = [["path", "line", "limit", "kind", "field", "confidence", "snippet"].join(",")];
    for (const f of findings) {
      rows.push([
        csvCell(rel(f.path, base)), f.line, f.limit ?? "",
        csvCell(f.kind), csvCell(f.field ?? ""), f.confidence, csvCell(f.snippet),
      ].join(","));
    }
    return rows.join("\n") + "\n";
  }

  if (fmt === "md") {
    const rows = ["| Limit | Where | Rule | Field | Confidence |", "| ---: | --- | --- | --- | --- |"];
    for (const f of findings) {
      const cap = f.limit === null ? "unbounded" : f.limit.toLocaleString("en-US");
      rows.push(`| ${cap} | \`${rel(f.path, base)}:${f.line}\` | ${f.kind} | ${f.field ?? ""} | ${f.confidence} |`);
    }
    return rows.join("\n") + "\n";
  }

  return findings.map((f) => formatFinding(f, base)).join("\n") + (findings.length ? "\n" : "");
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/** A +name / -name language selector, e.g. "+py" or "-json". */
const SELECTOR = /^([+-])([A-Za-z][A-Za-z0-9_.]*)$/;

/** Every spelling of "show help" — single-dash forms included, per house style. */
const HELP_TOKENS = new Set(["-help", "--help", "--h", "-h", "-?", "/?", "/h"]);

interface ParsedArgs {
  root: string;
  limit: number;
  include: string[];
  exclude: string[];
  format: Format | null;
  out: string | null;
  stdout: boolean;
  noStamp: boolean;
  highOnly: boolean;
  includeUnbounded: boolean;
  summary: boolean;
  listGroups: boolean;
  help: boolean;
  unknown: string[];
}

/**
 * Hand-rolled rather than using a parser library, because the +name / -name
 * grammar is not something argument parsers model: `-json` must mean "exclude
 * JSON files" while `--json` means "emit JSON output".
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    root: "", limit: DEFAULT_LIMIT, include: [], exclude: [],
    format: null, out: null, stdout: false, noStamp: false,
    highOnly: false, includeUnbounded: false, summary: false,
    listGroups: false, help: false, unknown: [],
  };
  let sawRoot = false;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];

    if (HELP_TOKENS.has(token.toLowerCase())) {
      parsed.help = true;
      continue;
    }

    // Two dashes: a flag. Checked before the selector pattern so `--json` can
    // never be read as an exclusion.
    if (token.startsWith("--")) {
      const flag = token.slice(2);
      if ((FORMATS as readonly string[]).includes(flag)) {
        // First format wins; a second one is a user mistake worth naming.
        if (parsed.format === null) parsed.format = flag as Format;
        else process.stderr.write(`note: several formats given, using --${parsed.format}\n`);
      } else if (flag === "limit") {
        parsed.limit = Number(argv[++i]);
      } else if (flag === "out") {
        parsed.out = argv[++i];
      } else if (flag === "stdout") parsed.stdout = true;
      else if (flag === "no-stamp") parsed.noStamp = true;
      else if (flag === "high-only") parsed.highOnly = true;
      else if (flag === "include-unbounded") parsed.includeUnbounded = true;
      else if (flag === "summary") parsed.summary = true;
      else if (flag === "list-groups") parsed.listGroups = true;
      else parsed.unknown.push(token);
      continue;
    }

    // One dash or a plus: a language selector.
    const selector = SELECTOR.exec(token);
    if (selector) {
      (selector[1] === "+" ? parsed.include : parsed.exclude).push(selector[2]);
      continue;
    }

    // Anything else is the path to scan. Only the first one counts.
    if (!sawRoot) {
      parsed.root = token;
      sawRoot = true;
    } else {
      parsed.unknown.push(token);
    }
  }

  if (!sawRoot) parsed.root = ".";
  return parsed;
}

function helpText(): string {
  const groups = Object.keys(EXT_GROUPS).sort().join(" ");
  return `usage: findInputLimits.ts [root] [+lang ...] [-lang ...] [options]

Find user-input character limits above a threshold, in any stack.

options:
  --limit N            report limits strictly greater than N (default ${DEFAULT_LIMIT})
  --high-only          drop ambiguous matches (.max(), length:, constants)
  --include-unbounded  also report TEXT / VARCHAR(MAX) columns with no ceiling
  --summary            counts by file and rule only
  --list-groups        list the +/- language names and exit
  -help                show this text (--h, -h, --help, -? all work)

output format (writes ./YYYYMMDD-HH-MM-SS-${DEFAULT_STEM}.<ext>):
  --json --csv --md --txt
  --out PATH           write the report here instead
  --no-stamp           drop the timestamp prefix: ./${DEFAULT_STEM}.<ext>
  --stdout             print the report instead of writing a file

what to search:
  (no selector)        every supported language
  +py +json            ONLY Python and JSON
  -py -json            everything EXCEPT Python and JSON
  +frontend -json      combine them: a group, minus a type

  names:
    ${groups}
  An unknown name is treated as a literal extension, so +kt works.
  Run --list-groups to see the extensions behind each name.

one dash vs two:
  -json   excludes JSON *files* from the search
  --json  selects JSON *output*
`;
}

export function main(argv: string[]): number {
  const args = parseArgs(argv);

  if (args.help) {
    process.stdout.write(helpText());
    return 0;
  }
  if (args.listGroups) {
    for (const name of Object.keys(EXT_GROUPS).sort()) {
      process.stdout.write(`  ${name.padEnd(10)} ${[...EXT_GROUPS[name]].sort().join(" ")}\n`);
    }
    return 0;
  }
  if (args.unknown.length) {
    process.stderr.write(`error: unrecognized argument(s): ${args.unknown.join(" ")}\n`);
    process.stderr.write("       run -help for usage.\n");
    return 2;
  }
  if (!Number.isFinite(args.limit) || args.limit < 0) {
    process.stderr.write("error: --limit needs a non-negative number.\n");
    return 2;
  }

  // Check the folder exists before doing any work, so a typo fails immediately
  // and says where it looked rather than reporting a cheerful zero findings.
  if (!existsSync(args.root)) {
    process.stderr.write(`error: no such file or folder: ${args.root}\n`);
    if (!resolve(args.root).startsWith(process.cwd()) || args.root !== resolve(args.root)) {
      process.stderr.write(`       (looked in ${process.cwd()})\n`);
    }
    return 2;
  }

  const wanted = resolveExtensions(args.include, args.exclude);
  const unknownNames = [...args.include, ...args.exclude].filter(
    (n) => !(n.toLowerCase().replace(/^\.+/, "") in EXT_GROUPS),
  );
  if (unknownNames.length) {
    process.stderr.write(`note: treating as literal extensions: ${unknownNames.join(", ")}\n`);
  }
  if (!wanted.size) {
    process.stderr.write("error: language selectors excluded every file type.\n");
    return 2;
  }

  const base = resolve(args.root);
  const findings = findOversizedInputLimits(args.root, {
    limit: args.limit,
    exts: [...wanted],
    includeUnbounded: args.includeUnbounded,
    highOnly: args.highOnly,
  });

  // --out with no explicit format still means "write a report"; infer from the
  // file suffix so `--out report.md` does the obvious thing.
  let fmt = args.format;
  if (fmt === null && args.out) {
    const suffix = extname(args.out).slice(1).toLowerCase();
    fmt = (FORMATS as readonly string[]).includes(suffix) ? (suffix as Format) : "txt";
  }

  let written: string | null = null;
  if (fmt) {
    const report = render(findings, fmt, base);
    if (args.stdout) {
      process.stdout.write(report);
    } else {
      written = args.out ?? join(process.cwd(), defaultReportName(fmt, !args.noStamp));
      mkdirSync(dirname(resolve(written)), { recursive: true });
      writeFileSync(written, report, "utf8");
    }
  } else if (args.summary) {
    const byFile = new Map<string, number>();
    const byKind = new Map<string, number>();
    for (const f of findings) {
      byFile.set(rel(f.path, base), (byFile.get(rel(f.path, base)) ?? 0) + 1);
      byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);
    }
    // Count descending, then name in codepoint order — never insertion order,
    // which would follow the directory walk and differ between machines.
    const sorted = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1] || byCodepoint(a[0], b[0]));
    for (const [name, count] of sorted(byFile)) process.stdout.write(`${String(count).padStart(5)}  ${name}\n`);
    process.stdout.write("\n");
    for (const [name, count] of sorted(byKind)) process.stdout.write(`${String(count).padStart(5)}  ${name}\n`);
  } else {
    for (const f of findings) process.stdout.write(formatFinding(f, base) + "\n");
  }

  // The trailing summary goes to stderr so `--stdout` output stays pipeable.
  let scope = args.include.length ? "+" + args.include.join(" +") : "all languages";
  if (args.exclude.length) scope += ` (minus ${args.exclude.join(", ")})`;
  process.stderr.write(
    `\n${findings.length} limit(s) over ${args.limit.toLocaleString("en-US")} characters -- ${scope}.\n`,
  );
  if (written) process.stderr.write(`wrote ${resolve(written)}\n`);

  // 1 means "found something", not "crashed" — that is what makes this usable
  // as a CI gate. Hard errors return 2.
  return findings.length ? 1 : 0;
}

// Run only when invoked directly, so importing the module for its exported
// functions does not kick off a scan.
if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  process.exit(main(process.argv.slice(2)));
}
