<!--
Evomedia.net Snippets — https://github.com/evomedia-net/evo.snippets
Created by Kelly Michels · kelly@evomedia.net
Licensed under the MIT License. See LICENSE.
-->

# find-oversized-input-limits

Scans a codebase for **user-input character limits above a threshold** (default
2500) and reports where each one is declared. One scanner covers every common
fullstack — no per-language configuration, no third-party dependencies.

Written for the case where a form field carries a character counter with a cap
that is too generous, and you need to find every place that cap is set: the
markup, the client validator, the server validator, and the column.

[**INSTALL.md**](INSTALL.md) is a step-by-step setup guide that assumes no prior
experience with Python: check your version, run one command, read the result.
Everything below is the reference.

## Run it

```bash
./run.sh /path/to/project
```

```powershell
.\run.ps1 C:\path\to\project
```

Both launchers pass every argument through to `find_input_limits.py` and pick
the first available `python` / `python3` / `py` on PATH. Python 3.9+, stdlib only.

To call it directly, or import the function:

```python
from find_input_limits import find_oversized_input_limits

for f in find_oversized_input_limits("./src", limit=2500, high_only=True):
    print(f.path, f.line, f.limit, f.kind)
```

## Choosing languages

| Selector | Meaning |
| --- | --- |
| *(nothing)* | scan every supported language |
| `+py +json` | scan **only** Python and JSON |
| `-py -json` | scan everything **except** Python and JSON |
| `--list-groups` | print every selector name and the extensions it covers |

Selectors combine: `+frontend -json` scans the frontend group minus JSON. An
unrecognized name is treated as a literal extension, so `+kt` and `-lock` work
without being defined as groups.

Group names: `py` `ts` `js` `web` `tpl` `php` `rb` `go` `java` `cs` `swift`
`dart` `rs` `ex` `sql` `prisma` `gql` `json` `yaml` `toml` `xml`, plus the
umbrellas `frontend`, `schema`, and `config`.

> **One dash versus two.** `-json` (one dash) excludes JSON *files* from the
> scan. `--json` (two dashes) selects JSON *output*. They are unrelated.

## Output formats

A `--format` flag writes a report into the **current directory** — not into the
project being scanned, so an audit never litters someone else's repo. The name
is timestamped `YYYYMMDD-HH-MM-SS-oversized-limits.<ext>`, so consecutive scans
never overwrite each other and the files sort chronologically.

| Flag | Writes |
| --- | --- |
| `--json` | `./20260811-19-06-51-oversized-limits.json` |
| `--csv` | `./20260811-19-06-51-oversized-limits.csv` |
| `--md` | Markdown table, ready to paste into an issue |
| `--txt` | the console listing |
| `--out PATH` | write exactly there instead; the format is inferred from the suffix if no format flag is given |
| `--no-stamp` | drop the timestamp — `./oversized-limits.<ext>` |
| `--stdout` | print the report rather than writing a file |

So `+json +py --json` scans only JSON and Python files and writes
`./20260811-19-06-51-oversized-limits.json`. Paths inside every report are
relative to the scanned root, so reports stay portable.

Use `--no-stamp` or `--out` in CI, where the artifact path has to be predictable:

```bash
./run.sh ../SWAG-Estimates --json --out reports/swag.json
```

## Other options

| Flag | Effect |
| --- | --- |
| `-help` | show help, including the full list of search selectors (`--h`, `-h`, `--help`, `-?` all work) |
| `--limit N` | report limits strictly greater than N (default 2500) |
| `--high-only` | drop ambiguous matches — see confidence below |
| `--include-unbounded` | also flag `TEXT` / `LONGTEXT` / `VARCHAR(MAX)` / `TextField` columns, which have no ceiling at all |
| `--summary` | counts by file and by rule instead of full output |

Exit code is **1 when anything is found**, 0 when clean, so it drops straight
into CI as a gate.

## What it recognizes

| Layer | Patterns |
| --- | --- |
| Markup | HTML `maxlength`, JSX `maxLength={n}`, Angular `[maxlength]="n"`, Vue `:maxlength`, Svelte |
| Python | Django/DRF `max_length=`, Pydantic `Field(max_length=)`, SQLAlchemy `String(n)`, WTForms/marshmallow `Length(max=n)` |
| TypeScript/JS | class-validator `@MaxLength`, `Validators.maxLength`, TypeORM/Sequelize `length:`, Mongoose, Prisma `@db.VarChar`, Zod/Yup/Joi `.max()` |
| PHP | Laravel `max:n` rules and `$table->string('col', n)`, Doctrine/Symfony `@Assert\Length` |
| Ruby | Rails `length: { maximum: n }`, migration `limit: n` |
| Go | `validate:"max=n"` and `binding:` struct tags, GORM `size:` / `type:varchar(n)` |
| Java | Bean Validation `@Size(max=n)`, JPA `@Column(length=n)` |
| C# / .NET | `[MaxLength]`, `[StringLength]`, EF Core `.HasMaxLength()` |
| Schema | SQL `VARCHAR(n)`, Prisma, JSON Schema / OpenAPI `"maxLength": n`, GraphQL, YAML |

## Confidence

Each finding is `high` or `medium`. Medium findings are printed with a trailing
`(?)` and come from patterns that are genuinely ambiguous:

- `.max(n)` — `z.string().max(5000)` is a character limit, `z.array(x).max(5000)`
  is an element count.
- `length: n` — a column width in TypeORM, an array size anywhere else.
- `MAX_*_LENGTH` style constants — usually right, occasionally a byte budget.

`--high-only` drops all of them.

## Known limits

- It finds **declared** limits. A `<textarea>` with no `maxlength` backed by a
  `TEXT` column is the *unbounded* case and needs `--include-unbounded`.
- It is line-based, so a limit split across lines
  (`max_length=`\n`    5000`) is missed.
- Vendor, build, and minified output is skipped, along with files over 2 MB and
  lines over 2000 characters.

## Performance

A digit-count prefilter derived from `--limit` skips any line that cannot
possibly match before the 22 regexes run. Real repositories scan in 2–5 seconds.
