#!/usr/bin/env python3
# Evomedia.net Snippets — https://github.com/evomedia-net/evo.snippets
# Created by Kelly Michels · dev@evomedia.net
# Licensed under the MIT License. See LICENSE.

"""Find user-input character limits above a threshold (default 2500) in any codebase.

One scanner, every common fullstack. Recognizes the places a maximum character
count gets declared across HTML/JSX/Angular/Vue, Python (Django, DRF, Pydantic,
SQLAlchemy, WTForms, marshmallow), TypeScript/JS (Zod, Yup, Joi, class-validator,
TypeORM, Sequelize, Mongoose, Prisma), PHP (Laravel, Symfony, Doctrine),
Ruby on Rails, Go (validator tags, GORM), Java/Spring (Bean Validation, JPA),
C#/.NET (DataAnnotations, EF Core), raw SQL DDL, and JSON Schema / OpenAPI.

Language selection (one dash excludes, plus includes):
    (nothing)          scan every supported language
    +py +json          scan ONLY Python and JSON
    -py -json          scan everything EXCEPT Python and JSON
    --list-groups      show every +/- name and the extensions it covers

Output format (two dashes) -- writes ./oversized-limits.<ext> unless redirected:
    --json --csv --md --txt
    --out PATH         write somewhere else
    --stdout           print instead of writing a file

Usage:
    python find_input_limits.py                        # scan cwd, limit > 2500
    python find_input_limits.py /path/to/project --limit 2000
    python find_input_limits.py . +ts +web             # frontend only
    python find_input_limits.py . -sql -config         # skip schema/config noise
    python find_input_limits.py . +json +py --json     # -> ./oversized-limits.json
    python find_input_limits.py . --md --out report.md
    python find_input_limits.py . --high-only          # drop ambiguous matches
    python find_input_limits.py . --include-unbounded  # also flag TEXT/VARCHAR(MAX)
    python find_input_limits.py . --summary            # counts by file and kind
    python find_input_limits.py -help

Note: `--json` (two dashes) selects JSON *output*. `-json` (one dash) excludes
JSON *files* from the scan. They are different things.

Exit code is 1 when anything is found, so it drops straight into CI.
No third-party dependencies; Python 3.9+.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import sys
from collections import Counter
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable, Iterator, Optional, Sequence

DEFAULT_LIMIT = 2500
MAX_FILE_BYTES = 2 * 1024 * 1024   # skip anything bigger; it is generated data
MAX_LINE_CHARS = 2000              # skip minified/bundled lines

# --- rules -----------------------------------------------------------------
# Every pattern exposes a named group "n" holding the numeric limit.
# An optional "field" group names the input it belongs to.
# Order matters: high-confidence rules first, so dedupe keeps the best label.

RULES: "list[tuple[str, re.Pattern, str]]" = [
    # -- markup / templates: HTML, JSX, Angular, Vue, Svelte, Blade, ERB ------
    ("html maxlength",
     re.compile(r"""(?:\[|:|v-bind:)?maxlength["']?\]?\s*[:=]\s*["'{]?\s*(?P<n>\d+)""", re.I), "high"),
    ("jsx maxLength",
     re.compile(r"""maxLength\s*=\s*[{"']\s*(?P<n>\d+)"""), "high"),

    # -- Python: Django, DRF, Pydantic, WTForms, marshmallow -----------------
    ("max_length kwarg",
     re.compile(r"""\bmax_?length\s*=\s*(?P<n>\d+)""", re.I), "high"),
    ("Length(max=n)",
     re.compile(r"""Length\s*\(\s*(?:min\s*=\s*\d+\s*,\s*)?max\s*=\s*(?P<n>\d+)"""), "high"),

    # -- TypeScript/JS decorators & ORMs -------------------------------------
    ("class-validator",
     re.compile(r"""@(?:MaxLength|Length)\s*\(\s*(?:\d+\s*,\s*)?(?P<n>\d+)"""), "high"),
    ("Validators.maxLength",
     re.compile(r"""Validators\.maxLength\s*\(\s*(?P<n>\d+)"""), "high"),
    ("prisma @db.VarChar",
     re.compile(r"""@db\.(?:VarChar|Char|Text)\s*\(\s*(?P<n>\d+)"""), "high"),

    # -- PHP: Laravel validation, Doctrine, Symfony --------------------------
    ("laravel max: rule",
     re.compile(r"""["'](?:[^"']*\|)?max:(?P<n>\d+)"""), "high"),
    ("laravel schema string()",
     re.compile(r"""->(?:string|char)\s*\(\s*["'](?P<field>\w+)["']\s*,\s*(?P<n>\d+)"""), "high"),
    ("symfony/doctrine length",
     re.compile(r"""(?:@Assert\\Length\s*\(|@ORM\\Column\s*\().*?\bmax(?:Length)?\s*[:=]\s*["']?(?P<n>\d+)""", re.I), "high"),

    # -- Ruby on Rails --------------------------------------------------------
    ("rails length maximum",
     re.compile(r"""(?:length\s*:\s*\{[^}]*?maximum\s*:\s*|maximum\s*:\s*)(?P<n>\d+)"""), "high"),
    ("rails limit:",
     re.compile(r"""\blimit\s*:\s*(?P<n>\d+)"""), "medium"),

    # -- Go: validator/binding struct tags, GORM ------------------------------
    ("go validate tag",
     re.compile(r"""(?:validate|binding)\s*:\s*"[^"]*?\bmax\s*=\s*(?P<n>\d+)"""), "high"),
    ("gorm size/type tag",
     re.compile(r"""gorm\s*:\s*"[^"]*?(?:size\s*:\s*(?P<n>\d+)|type\s*:\s*varchar\s*\(\s*(?P<n2>\d+)\s*\))""", re.I), "high"),

    # -- Java / Spring: Bean Validation, JPA ----------------------------------
    ("@Size(max=n)",
     re.compile(r"""@(?:Size|Length)\s*\(\s*(?:min\s*=\s*\d+\s*,\s*)?max\s*=\s*(?P<n>\d+)"""), "high"),
    ("@Column(length=n)",
     re.compile(r"""@Column\s*\([^)]*?\blength\s*=\s*(?P<n>\d+)"""), "high"),

    # -- C# / .NET: DataAnnotations, EF Core ----------------------------------
    ("[MaxLength/StringLength]",
     re.compile(r"""\[\s*(?:MaxLength|StringLength)\s*\(\s*(?P<n>\d+)"""), "high"),
    ("EF HasMaxLength",
     re.compile(r"""\.HasMaxLength\s*\(\s*(?P<n>\d+)"""), "high"),

    # -- SQL DDL / ORM column types (all languages) ---------------------------
    ("varchar/String(n)",
     re.compile(r"""\b(?:VARCHAR2?|NVARCHAR|CHARACTER\s+VARYING|NCHAR|DataTypes\.STRING|String|Unicode|VarChar)\s*\(\s*(?P<n>\d+)""", re.I), "high"),

    # -- schema/config: JSON Schema, OpenAPI, GraphQL, YAML -------------------
    # ("maxLength": 4000) is caught by the html rule's [:=] branch.
    ("column length option",
     re.compile(r"""\blength\s*[:=]\s*(?P<n>\d+)"""), "medium"),

    # -- ambiguous but worth surfacing ----------------------------------------
    ("validator .max()",   # Zod/Yup/Joi/Valibot; also matches numeric bounds
     re.compile(r"""\.(?:max|maxLength)\s*\(\s*(?P<n>\d+)"""), "medium"),
    ("length constant",    # MAX_BODY_LENGTH = 5000, maxChars: 5000, charLimit = 5000
     re.compile(
         r"""(?P<field>\b\w*(?:MAX|max|Max)\w*(?:LEN|LENGTH|Length|length|CHARS|Chars|chars|SIZE|Size|size)\w*"""
         r"""|\b\w*(?:char|CHAR|Char)\w*(?:limit|LIMIT|Limit)\w*)\s*[:=]\s*(?P<n>\d+)\b"""), "medium"),
]

# Column types with no declared ceiling. Only reported with --include-unbounded.
UNBOUNDED = re.compile(
    r"""\b(?:LONGTEXT|MEDIUMTEXT|TEXT\b|CLOB|VARCHAR\s*\(\s*MAX\s*\)|NVARCHAR\s*\(\s*MAX\s*\)"""
    r"""|models\.TextField|@db\.Text|\bText\s*\(\s*\))""", re.I)

# Nearest identifier on the same line, used to label a bare limit.
FIELD_HINT = re.compile(
    r"""(?:name|id|field|label|formControlName|v-model|ng-model)\s*[:=]\s*["'{]?(?P<field>[\w.\-]+)""", re.I)

# --- language groups -------------------------------------------------------
# The names usable as +name / -name on the command line. An unrecognized name
# is treated as a bare file extension, so `+kt` and `-lock` also work.

EXT_GROUPS: "dict[str, set[str]]" = {
    "py":     {".py", ".pyi"},
    "ts":     {".ts", ".tsx", ".mts", ".cts"},
    "js":     {".js", ".jsx", ".mjs", ".cjs"},
    "web":    {".html", ".htm", ".vue", ".svelte", ".astro"},
    "tpl":    {".jinja", ".jinja2", ".j2", ".twig", ".erb", ".haml",
               ".hbs", ".ejs", ".liquid", ".razor", ".cshtml", ".aspx"},
    "php":    {".php"},
    "rb":     {".rb", ".rake"},
    "go":     {".go"},
    "java":   {".java", ".kt", ".kts", ".scala"},
    "cs":     {".cs", ".vb"},
    "swift":  {".swift"},
    "dart":   {".dart"},
    "rs":     {".rs"},
    "ex":     {".ex", ".exs"},
    "sql":    {".sql"},
    "prisma": {".prisma"},
    "gql":    {".graphql", ".gql", ".proto"},
    "json":   {".json"},
    "yaml":   {".yml", ".yaml"},
    "toml":   {".toml"},
    "xml":    {".xml", ".xsd"},
}
# Convenience umbrellas.
EXT_GROUPS["frontend"] = EXT_GROUPS["ts"] | EXT_GROUPS["js"] | EXT_GROUPS["web"] | EXT_GROUPS["tpl"]
EXT_GROUPS["schema"] = EXT_GROUPS["sql"] | EXT_GROUPS["prisma"] | EXT_GROUPS["gql"]
EXT_GROUPS["config"] = EXT_GROUPS["json"] | EXT_GROUPS["yaml"] | EXT_GROUPS["toml"] | EXT_GROUPS["xml"]

SOURCE_EXTS = set().union(*EXT_GROUPS.values())

SKIP_DIRS = {
    ".git", ".hg", ".svn", ".idea", ".vscode", ".claude",
    ".venv", "venv", "env", ".env", "virtualenv", "site-packages", ".tox",
    "node_modules", "bower_components", "vendor", "packages",
    "__pycache__", ".mypy_cache", ".pytest_cache", ".ruff_cache", ".cache",
    ".next", ".nuxt", ".svelte-kit", ".turbo", ".angular", ".output",
    "dist", "build", "out", "target", "bin", "obj",
    "coverage", "htmlcov", "storybook-static", ".terraform", ".gradle",
    "migrations_backup", "backups", "archive", "temp", "tmp",
}

SKIP_FILE_PATTERNS = (
    ".min.js", ".min.css", ".bundle.js", ".chunk.js", ".d.ts",
    "-lock.json", ".lock", ".map", ".snap",
)


@dataclass(frozen=True)
class Finding:
    """One declared length limit that exceeds the threshold."""

    path: str
    line: int
    limit: Optional[int]      # None == unbounded (TEXT / VARCHAR(MAX))
    kind: str
    field: Optional[str]
    snippet: str
    confidence: str           # "high" | "medium"

    def format(self, root: Optional[Path] = None) -> str:
        shown = self.path
        if root is not None:
            try:
                shown = Path(self.path).relative_to(root).as_posix()
            except ValueError:
                pass
        cap = "unbounded" if self.limit is None else f"{self.limit:,}"
        name = f" [{self.field}]" if self.field else ""
        mark = "" if self.confidence == "high" else "  (?)"
        return f"{shown}:{self.line}: {cap:>9}  {self.kind}{name}{mark}\n    {self.snippet}"


def resolve_extensions(
    include: Optional[Iterable[str]] = None,
    exclude: Optional[Iterable[str]] = None,
) -> "set[str]":
    """Turn +name / -name selectors into a concrete set of file extensions.

    ``include`` empty means "every supported language". Names are matched
    against EXT_GROUPS first, then fall back to a literal extension.
    """
    def expand(names: Iterable[str]) -> "set[str]":
        out: "set[str]" = set()
        for name in names:
            key = name.lower().lstrip(".")
            if key in EXT_GROUPS:
                out |= EXT_GROUPS[key]
            else:
                out.add(f".{key}")
        return out

    wanted = expand(include) if include else set(SOURCE_EXTS)
    return wanted - expand(exclude or [])


def iter_source_files(
    root: Path,
    exts: Optional[Sequence[str]] = None,
    skip_dirs: Iterable[str] = SKIP_DIRS,
) -> Iterator[Path]:
    """Yield candidate source files under *root*, pruning vendor/build dirs."""
    wanted = {e.lower() if e.startswith(".") else f".{e.lower()}" for e in exts} if exts else SOURCE_EXTS
    skip = set(skip_dirs)

    if root.is_file():
        yield root
        return

    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in skip and not d.endswith(".egg-info")]
        for name in filenames:
            if any(name.endswith(p) for p in SKIP_FILE_PATTERNS):
                continue
            if Path(name).suffix.lower() not in wanted:
                continue
            yield Path(dirpath) / name


def scan_file(
    path: Path,
    limit: int = DEFAULT_LIMIT,
    include_unbounded: bool = False,
    prefilter: Optional[re.Pattern] = None,
) -> "list[Finding]":
    """Return every declared length limit in *path* that exceeds *limit*."""
    try:
        if path.stat().st_size > MAX_FILE_BYTES:
            return []
        raw = path.read_bytes()
    except OSError:
        return []
    if b"\x00" in raw[:8192]:          # binary
        return []

    # Any limit over N has at least len(str(N)) digits, so lines without a digit
    # run that long cannot match. This skips most lines before any rule runs.
    if prefilter is None:
        prefilter = re.compile(r"\d{%d,}" % len(str(limit)))

    findings: "list[Finding]" = []
    posix = path.as_posix()

    for lineno, line in enumerate(raw.decode("utf-8", errors="replace").splitlines(), start=1):
        if len(line) > MAX_LINE_CHARS:
            continue

        if include_unbounded and UNBOUNDED.search(line):
            findings.append(Finding(posix, lineno, None, "unbounded text column",
                                    None, line.strip()[:200], "medium"))

        if not prefilter.search(line):
            continue

        # Dedupe per (line, value): first rule wins, but a high-confidence rule
        # can upgrade an earlier medium one.
        seen: "dict[int, Finding]" = {}
        for kind, pattern, confidence in RULES:
            for m in pattern.finditer(line):
                groups = m.groupdict()
                raw_n = groups.get("n") or groups.get("n2")
                if not raw_n:
                    continue
                value = int(raw_n)
                if value <= limit:
                    continue
                prior = seen.get(value)
                if prior is not None and prior.confidence == "high":
                    continue
                hint = FIELD_HINT.search(line)
                seen[value] = Finding(
                    path=posix, line=lineno, limit=value, kind=kind,
                    field=groups.get("field") or (hint.group("field") if hint else None),
                    snippet=line.strip()[:200], confidence=confidence,
                )
        findings.extend(seen.values())

    return findings


def find_oversized_input_limits(
    root: "str | Path" = ".",
    limit: int = DEFAULT_LIMIT,
    exts: Optional[Sequence[str]] = None,
    include_unbounded: bool = False,
    high_only: bool = False,
) -> "list[Finding]":
    """Scan *root* and return every user-input length limit above *limit*.

    Sorted largest-limit-first (unbounded first), then by path and line.
    Findings marked ``confidence == "medium"`` come from ambiguous patterns --
    ``.max(n)`` may bound a number rather than a string length, and ``length: n``
    may be an array size. Pass ``high_only=True`` to drop them.
    """
    base = Path(root).resolve()
    prefilter = re.compile(r"\d{%d,}" % len(str(limit)))
    results: "list[Finding]" = []
    for path in iter_source_files(base, exts):
        results.extend(scan_file(path, limit, include_unbounded, prefilter))
    if high_only:
        results = [f for f in results if f.confidence == "high"]
    results.sort(key=lambda f: (-(f.limit if f.limit is not None else sys.maxsize), f.path, f.line))
    return results


# --- output formats --------------------------------------------------------

FORMATS = ("json", "csv", "md", "txt")
DEFAULT_STEM = "oversized-limits"
STAMP_FORMAT = "%Y%m%d-%H-%M-%S"


def default_report_name(fmt: str, stamp: bool = True) -> str:
    """Report filename: 20260811-19-05-33-oversized-limits.json, or unstamped."""
    prefix = f"{datetime.now().strftime(STAMP_FORMAT)}-" if stamp else ""
    return f"{prefix}{DEFAULT_STEM}.{fmt}"


def _rel(path: str, base: Optional[Path]) -> str:
    if base is None:
        return path
    try:
        return Path(path).relative_to(base).as_posix()
    except ValueError:
        return path


def render(findings: "list[Finding]", fmt: str, base: Optional[Path] = None) -> str:
    """Serialize *findings* as json, csv, md, or txt."""
    if fmt == "json":
        records = []
        for f in findings:
            record = asdict(f)
            record["path"] = _rel(f.path, base)
            records.append(record)
        return json.dumps(records, indent=2)

    if fmt == "csv":
        buf = io.StringIO()
        writer = csv.writer(buf, lineterminator="\n")
        writer.writerow(["path", "line", "limit", "kind", "field", "confidence", "snippet"])
        for f in findings:
            writer.writerow([_rel(f.path, base), f.line, "" if f.limit is None else f.limit,
                             f.kind, f.field or "", f.confidence, f.snippet])
        return buf.getvalue()

    if fmt == "md":
        rows = ["| Limit | Where | Rule | Field | Confidence |",
                "| ---: | --- | --- | --- | --- |"]
        for f in findings:
            cap = "unbounded" if f.limit is None else f"{f.limit:,}"
            rows.append(f"| {cap} | `{_rel(f.path, base)}:{f.line}` | {f.kind} "
                        f"| {f.field or ''} | {f.confidence} |")
        return "\n".join(rows) + "\n"

    return "\n".join(f.format(base) for f in findings) + ("\n" if findings else "")


# --- CLI -------------------------------------------------------------------

SELECTOR = re.compile(r"^([+-])([A-Za-z][A-Za-z0-9_.]*)$")
# `--h` is intercepted here rather than left to argparse, where it would be an
# ambiguous prefix of --help / --high-only.
HELP_TOKENS = {"-help", "--h", "-h", "-?", "/?", "/h"}


def split_selectors(argv: Sequence[str]) -> "tuple[list[str], list[str], list[str]]":
    """Pull +name / -name language selectors out of *argv*.

    Returns (remaining_argv, include_names, exclude_names). Anything starting
    with `--` is left alone, so `--json` (output format) never collides with
    `-json` (exclude JSON files). Single-dash help tokens are normalized to
    `--help` before they can be mistaken for a `-name` exclusion.
    """
    remaining: "list[str]" = []
    include: "list[str]" = []
    exclude: "list[str]" = []
    for token in argv:
        if token.lower() in HELP_TOKENS:
            remaining.append("--help")
            continue
        if token.startswith("--"):
            remaining.append(token)
            continue
        m = SELECTOR.match(token)
        if not m:
            remaining.append(token)
            continue
        (include if m.group(1) == "+" else exclude).append(m.group(2))
    return remaining, include, exclude


def main(argv: Optional[Sequence[str]] = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    argv, include, exclude = split_selectors(argv)

    groups = " ".join(sorted(EXT_GROUPS))
    parser = argparse.ArgumentParser(
        prog="find_input_limits.py",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description="Find user-input character limits above a threshold, in any stack.",
        epilog=(
            "what to search:\n"
            "  (no selector)        every supported language\n"
            "  +py +json            ONLY Python and JSON\n"
            "  -py -json            everything EXCEPT Python and JSON\n"
            "  +frontend -json      combine them: a group, minus a type\n"
            "\n"
            f"  names:\n    {groups}\n"
            "  An unknown name is treated as a literal extension, so +kt works.\n"
            "  Run --list-groups to see the extensions behind each name.\n"
            "\n"
            "one dash vs two:\n"
            "  -json   excludes JSON *files* from the search\n"
            "  --json  selects JSON *output*\n"
        ),
    )
    parser.add_argument("root", nargs="?", default=".", help="file or directory to scan")
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT,
                        help=f"report limits strictly greater than this (default {DEFAULT_LIMIT})")
    parser.add_argument("--include-unbounded", action="store_true",
                        help="also report TEXT / VARCHAR(MAX) columns with no ceiling")
    parser.add_argument("--high-only", action="store_true",
                        help="drop ambiguous matches (.max(), length:, constants)")
    parser.add_argument("--summary", action="store_true", help="counts by file and rule only")
    parser.add_argument("--list-groups", action="store_true",
                        help="list the +/- language names and exit")

    fmt_group = parser.add_argument_group(
        "output format",
        f"writes ./YYYYMMDD-HH-MM-SS-{DEFAULT_STEM}.<ext> unless --out or --stdout "
        "is given. Note: --json (two dashes) is JSON output; -json (one dash) "
        "excludes JSON files.")
    fmt_group.add_argument("--json", action="store_true", help="JSON records")
    fmt_group.add_argument("--csv", action="store_true", help="CSV, one row per finding")
    fmt_group.add_argument("--md", action="store_true", help="Markdown table")
    fmt_group.add_argument("--txt", action="store_true", help="the console listing, as a file")
    fmt_group.add_argument("--out", metavar="PATH", help="write the report here instead")
    fmt_group.add_argument("--stdout", action="store_true",
                           help="print the report instead of writing a file")
    fmt_group.add_argument("--no-stamp", action="store_true",
                           help=f"drop the timestamp prefix: ./{DEFAULT_STEM}.<ext>")
    args = parser.parse_args(argv)

    if args.list_groups:
        for name in sorted(EXT_GROUPS):
            print(f"  {name:<10} {' '.join(sorted(EXT_GROUPS[name]))}")
        return 0

    root = Path(args.root)
    if not root.exists():
        print(f"error: no such file or folder: {root}", file=sys.stderr)
        if not root.is_absolute():
            print(f"       (looked in {Path.cwd()})", file=sys.stderr)
        return 2
    if root.is_file() and root.suffix.lower() not in SOURCE_EXTS:
        print(f"note: {root.name} is not a recognized source type; scanning it anyway",
              file=sys.stderr)

    exts = sorted(resolve_extensions(include, exclude))
    unknown = [n for n in include + exclude if n.lower().lstrip(".") not in EXT_GROUPS]
    if unknown:
        print(f"note: treating as literal extensions: {', '.join(unknown)}", file=sys.stderr)
    if not exts:
        print("error: language selectors excluded every file type.", file=sys.stderr)
        return 2

    findings = find_oversized_input_limits(
        args.root, limit=args.limit, exts=exts,
        include_unbounded=args.include_unbounded, high_only=args.high_only,
    )
    base = Path(args.root).resolve()

    chosen = [f for f in FORMATS if getattr(args, f)]
    if len(chosen) > 1:
        print(f"note: several formats given, using --{chosen[0]}", file=sys.stderr)
    fmt = chosen[0] if chosen else None
    if fmt is None and args.out:
        # --out on its own still means "write a report"; infer from the suffix.
        suffix = Path(args.out).suffix.lstrip(".").lower()
        fmt = suffix if suffix in FORMATS else "txt"

    written: Optional[Path] = None
    if fmt:
        report = render(findings, fmt, base)
        if args.stdout:
            print(report, end="")
        else:
            written = (Path(args.out) if args.out
                       else Path.cwd() / default_report_name(fmt, stamp=not args.no_stamp))
            written.parent.mkdir(parents=True, exist_ok=True)
            written.write_text(report, encoding="utf-8")
    elif args.summary:
        # Sorted by count then name rather than Counter.most_common(), whose tie
        # order follows os.walk() and so differs between machines.
        by_file = Counter(_rel(f.path, base) for f in findings)
        by_kind = Counter(f.kind for f in findings)
        for group in (by_file, by_kind):
            for name, count in sorted(group.items(), key=lambda kv: (-kv[1], kv[0])):
                print(f"{count:>5}  {name}")
            if group is by_file:
                print()
    else:
        for f in findings:
            print(f.format(base))

    scope = "all languages" if not include else "+" + " +".join(include)
    if exclude:
        scope += " (minus " + ", ".join(exclude) + ")"
    print(f"\n{len(findings)} limit(s) over {args.limit:,} characters -- {scope}.", file=sys.stderr)
    if written is not None:
        print(f"wrote {written}", file=sys.stderr)
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
