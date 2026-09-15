#!/usr/bin/env python3
"""Generate a .txt twin for every .md, and fail the build when one is stale.

    python check_md_twins.py            # rewrite every twin
    python check_md_twins.py --check    # exit 1 if any is out of sync

The twins exist for terminals, pagers, diffs and anywhere markdown does not
render. They were hand-kept until now, which works right up until it does not:
a hand-kept duplicate drifts, and the drift is invisible precisely because
nobody reads both copies. This repository carries eleven of them, and it is
about to be public - a stale twin would be stale in front of strangers.

So the twins are generated and CI runs --check. An edit to a .md that forgets
to regenerate fails rather than ships.

Every .md is covered, discovered rather than listed: a hand-kept list is one
more thing to forget, and the twin that gets forgotten is the one nobody
notices is stale. That matters more here than in a flat repo, because each
snippet carries its own README, INSTALL and COMMAND.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv"}


def _link(m: re.Match[str]) -> str:
    """text (url) - unless the text already IS the url, which reads as
    `foo/bar/ (foo/bar/)` and is how the hand-kept twins sensibly wrote it."""
    label, url = m.group(1), m.group(2)
    # Backticks first: these links are written [`path/`](path/), so the label
    # still carries its inline-code markers at this point and would never
    # compare equal to the bare url.
    bare = label.strip().strip("`").strip()
    return label if bare == url.strip() else f"{label} ({url})"


def _inline(text: str) -> str:
    text = re.sub(r"!\[([^\]]*)\]\([^)]*\)", r"\1", text)          # images -> alt
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", _link, text)         # links -> text (url)
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)                 # bold
    text = re.sub(r"(?<!\*)\*([^*\n]+)\*(?!\*)", r"\1", text)      # italic
    text = re.sub(r"`([^`]+)`", r"\1", text)                       # inline code
    return text


def render(md: str) -> str:
    out: list[str] = []
    in_fence = False
    in_comment = False
    for line in md.splitlines():
        # The file headers in this repo are HTML comments; they carry the
        # licence line, so they are kept, just without the markers.
        if "<!--" in line:
            in_comment = True
            line = line.replace("<!--", "")
        if "-->" in line:
            line = line.replace("-->", "")
            in_comment = False
            if not line.strip():
                continue
        if line.lstrip().startswith("```"):
            # Drop the fence markers; the code stays, indented, so it still
            # reads as a block without the backticks.
            in_fence = not in_fence
            continue
        if in_fence:
            out.append(("    " + line) if line else "")
            continue
        heading = re.match(r"^(#{1,6})\s+(.*)$", line)
        if heading:
            text = _inline(heading.group(2))
            out.append(text)
            out.append(("=" if len(heading.group(1)) == 1 else "-") * len(text))
            continue
        out.append(line if in_comment else _inline(line))
    text = "\n".join(out)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip() + "\n"


def twins() -> list[Path]:
    """Every .md that owes a .txt, at any depth, in a stable order."""
    return sorted(
        p for p in ROOT.rglob("*.md")
        if not SKIP_DIRS & set(p.relative_to(ROOT).parts)
    )


def main() -> int:
    check = "--check" in sys.argv
    stale: list[str] = []
    for source in twins():
        rendered = render(source.read_text(encoding="utf-8"))
        target = source.with_suffix(".txt")
        rel = target.relative_to(ROOT).as_posix()
        if check:
            current = target.read_text(encoding="utf-8") if target.exists() else ""
            if current != rendered:
                stale.append(rel)
            continue
        target.write_text(rendered, encoding="utf-8", newline="\n")
        print(f"Wrote {rel} ({len(rendered.splitlines())} lines)")
    if check:
        if stale:
            print(f"out of sync: {', '.join(stale)}")
            print("run: python check_md_twins.py")
            return 1
        print(f"{len(twins())} twin(s) in sync")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
