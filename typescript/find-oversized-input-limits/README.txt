<!--
Evomedia.net Snippets — https://github.com/evomedia-net/evo.snippets
Created by Kelly Michels · dev@evomedia.net
Licensed under the MIT License. See LICENSE.
-->

find-oversized-input-limits (TypeScript)
========================================

Scans a codebase for user-input character limits above a threshold (default
2500) and reports where each one is declared. One scanner covers every common
fullstack — no per-language configuration, no dependencies, no build step.

Written for the case where a form field carries a character counter with a cap
that is too generous, and you need to find every place that cap is set: the
markup, the client validator, the server validator, and the column.

> This is the TypeScript twin of python/find-oversized-input-limits (../../python/find-oversized-input-limits/).
> Identical rules, identical flags, byte-identical output — verified by diffing
> both tools across all twelve modes. Run whichever runtime your machine has.

INSTALL.md (INSTALL.md) is a step-by-step setup guide that assumes no prior
experience: check your Node version, run one command, read the result.
Everything below is the reference.

Run it
------

    ./run.sh /path/to/project

    .\run.ps1 C:\path\to\project

Both launchers pass every argument through and handle Node version detection.

To import the function instead:

    import { findOversizedInputLimits } from "./findInputLimits.ts";

    for (const f of findOversizedInputLimits("./src", { limit: 2500, highOnly: true })) {
      console.log(f.path, f.line, f.limit, f.kind);
    }

Requirements
------------

Node 22.6+. Node runs TypeScript directly from 23.6 on; 22.6–23.5 needs
--experimental-strip-types, which the launchers add automatically. On older
Node they exit 2 with a message pointing at the Python twin. There is no build
step and no package.json — the .ts file is the program.

Choosing languages
------------------

| Selector | Meaning |
| --- | --- |
| (nothing) | scan every supported language |
| +py +json | scan only Python and JSON |
| -py -json | scan everything except Python and JSON |
| --list-groups | print every selector name and the extensions it covers |

Selectors combine: +frontend -json scans the frontend group minus JSON. An
unrecognized name is treated as a literal extension, so +kt and -lock work
without being defined as groups.

Group names: py ts js web tpl php rb go java cs swift
dart rs ex sql prisma gql json yaml toml xml, plus the
umbrellas frontend, schema, and config.

> One dash versus two. -json (one dash) excludes JSON files from the
> scan. --json (two dashes) selects JSON output. They are unrelated.

Output formats
--------------

A --format flag writes a report into the current directory — not into the
project being scanned, so an audit never litters someone else's repo. The name
is timestamped YYYYMMDD-HH-MM-SS-oversized-limits.<ext>, so consecutive scans
never overwrite each other and the files sort chronologically.

| Flag | Writes |
| --- | --- |
| --json | ./20260811-20-05-31-oversized-limits.json |
| --csv | ./20260811-20-05-31-oversized-limits.csv |
| --md | Markdown table, ready to paste into an issue |
| --txt | the console listing |
| --out PATH | write exactly there instead; the format is inferred from the suffix if no format flag is given. Missing folders are created |
| --no-stamp | drop the timestamp — ./oversized-limits.<ext> |
| --stdout | print the report rather than writing a file |

Paths inside every report are relative to the scanned root, so reports stay
portable. Use --no-stamp or --out in CI, where the artifact path has to be
predictable.

Other options
-------------

| Flag | Effect |
| --- | --- |
| -help | show help, including the full list of search selectors (--h, -h, --help, -? all work) |
| --limit N | report limits strictly greater than N (default 2500) |
| --high-only | drop ambiguous matches — see confidence below |
| --include-unbounded | also flag TEXT / LONGTEXT / VARCHAR(MAX) / TextField columns, which have no ceiling at all |
| --summary | counts by file and by rule instead of full output |

Exit codes: 0 clean, 1 findings exist, 2 usage or environment error.
The 0/1 split is what lets it drop into CI as a gate.

What it recognizes
------------------

| Layer | Patterns |
| --- | --- |
| Markup | HTML maxlength, JSX maxLength={n}, Angular [maxlength]="n", Vue :maxlength, Svelte |
| Python | Django/DRF max_length=, Pydantic Field(max_length=), SQLAlchemy String(n), WTForms/marshmallow Length(max=n) |
| TypeScript/JS | class-validator @MaxLength, Validators.maxLength, TypeORM/Sequelize length:, Mongoose, Prisma @db.VarChar, Zod/Yup/Joi .max() |
| PHP | Laravel max:n rules and $table->string('col', n), Doctrine/Symfony @Assert\Length |
| Ruby | Rails length: { maximum: n }, migration limit: n |
| Go | validate:"max=n" and binding: struct tags, GORM size: / type:varchar(n) |
| Java | Bean Validation @Size(max=n), JPA @Column(length=n) |
| C# / .NET | [MaxLength], [StringLength], EF Core .HasMaxLength() |
| Schema | SQL VARCHAR(n), Prisma, JSON Schema / OpenAPI "maxLength": n, GraphQL, YAML |

Confidence
----------

Each finding is high or medium. Medium findings are printed with a trailing
(?) and come from patterns that are genuinely ambiguous:

- .max(n) — z.string().max(5000) is a character limit, z.array(x).max(5000)
  is an element count.
- length: n — a column width in TypeORM, an array size anywhere else.
- MAX_*_LENGTH style constants — usually right, occasionally a byte budget.

--high-only drops all of them.

Known limits
------------

- It finds declared limits. A <textarea> with no maxlength backed by a
  TEXT column is the unbounded case and needs --include-unbounded.
- It is line-based, so a limit split across lines is missed.
- Vendor, build, and minified output is skipped, along with files over 2 MB and
  lines over 2000 characters.

Performance
-----------

A digit-count prefilter derived from --limit skips any line that cannot
possibly match before the 22 regexes run. Real repositories scan in a few
seconds.
