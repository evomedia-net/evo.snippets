#!/usr/bin/env python3
# Evomedia.net Snippets — https://github.com/evomedia-net/evo.snippets
r"""Refuse any tracked file that contains a path from a developer's own machine.

A usage example like `.\run.ps1 F:\evomedia.net\www` is harmless on the
machine it was typed on and wrong everywhere else: it leaks the author's disk
layout, and nobody else can run it. Examples use placeholders -
C:\path\to\project, /path/to/project - and this script is what holds that line.

No dependencies. Exit 1 if any tracked file offends, 0 when clean.

    python check_no_local_paths.py
"""
import re
import subprocess
import sys

# What counts as "someone's machine":
#   F:\evomedia.net\www   F:/evomedia.net/www   (any drive letter, either slash)
#   /mnt/f/evomedia.net                         (WSL mount)
#   /f/evomedia.net                             (Git Bash drive root)
#   C:\Users\<name>\...                         (a Windows profile)
# What does not: C:\tools\... and C:\path\to\... describe where *a* user might
# put something, not where one user did. Those are the placeholders to use.
_DRIVE = r"[A-Za-z]:[\\/](?!tools[\\/]|path[\\/])[^\s\"'`)>]+"
_WSL = r"/mnt/[a-z]/[^\s\"'`)>]+"
_GITBASH = r"/[a-z]/evomedia[^\s\"'`)>]*"
_PROFILE = r"C:[\\/]+Users[\\/]+[^\s\"'`)>]+"
PATTERN = re.compile(r"(?<![A-Za-z0-9])(?:%s|%s|%s|%s)" % (_PROFILE, _DRIVE, _WSL, _GITBASH))

TEXT_SUFFIXES = (".md", ".txt", ".py", ".ts", ".js", ".ps1", ".sh", ".cmd",
                 ".json", ".yml", ".yaml", ".toml", ".cfg", ".ini")
SELF = "check_no_local_paths.py"


def tracked_files():
    out = subprocess.run(["git", "ls-files", "-z"], check=True,
                         capture_output=True).stdout
    return [p for p in out.decode("utf-8").split("\0") if p]


def offenders(paths):
    for path in paths:
        if path == SELF or not path.lower().endswith(TEXT_SUFFIXES):
            continue
        try:
            text = open(path, encoding="utf-8").read()
        except (UnicodeDecodeError, OSError):
            continue
        for n, line in enumerate(text.splitlines(), 1):
            m = PATTERN.search(line)
            if m:
                yield path, n, m.group(0)


def main() -> int:
    found = list(offenders(tracked_files()))
    for path, n, hit in found:
        print(f"{path}:{n}: local machine path: {hit}")
    if found:
        print("\n%d local path(s) found. Use C:\\path\\to\\project or "
              "/path/to/project in examples." % len(found), file=sys.stderr)
        return 1
    print("no local machine paths in tracked files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
