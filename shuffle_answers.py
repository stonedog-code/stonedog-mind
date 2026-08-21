#!/usr/bin/env python3
"""One-off content fix: remove positional bias from the pack files.

Every question was authored with its correct answer written first, so 155 of 157
answers sat at index 0. That is the single most exploitable flaw a
multiple-choice bank can have — a candidate who always picks A scores ~100%
without reading anything, and the retention signal becomes noise.

Each item's options are rotated by an offset derived deterministically from its
id, and `answer` is adjusted to follow. Rotation (not a full shuffle) keeps each
option line byte-identical, so this is a line-level edit and the comments,
block scalars and formatting in the pack files all survive.

Deterministic: re-running produces no further change, and the same id always
yields the same offset, so a pack file is reproducible from its source.
"""

from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path

ID_RE = re.compile(r"^(\s*)- id:\s*(\S+)\s*$")
FLOW_RE = re.compile(r"^(\s*)options:\s*\[(.*)\]\s*$")
BLOCK_RE = re.compile(r"^(\s*)options:\s*$")
ANSWER_RE = re.compile(r"^(\s*)answer:\s*(\d+)\s*$")


def offset_for(item_id: str, n: int) -> int:
    """Stable per-item rotation.

    An earlier version excluded 0 so that every item would visibly move. That
    produced the opposite bias — index 0 held only 3% of answers, so "never
    pick A" became weakly exploitable. Excluding an outcome to make a change
    look effective is how you trade a loud bias for a quiet one.
    """
    digest = hashlib.sha256(item_id.encode()).digest()
    return digest[1] % n if n > 1 else 0


def split_flow(body: str) -> list[str]:
    """Split a YAML flow sequence on commas outside quotes."""
    parts, current, in_quote = [], "", None
    for ch in body:
        if in_quote:
            current += ch
            if ch == in_quote:
                in_quote = None
        elif ch in "\"'":
            in_quote = ch
            current += ch
        elif ch == ",":
            parts.append(current.strip())
            current = ""
        else:
            current += ch
    if current.strip():
        parts.append(current.strip())
    return parts


def process(path: Path) -> int:
    lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
    out: list[str] = []
    i = 0
    changed = 0

    while i < len(lines):
        m = ID_RE.match(lines[i].rstrip("\n"))
        if not m:
            out.append(lines[i])
            i += 1
            continue

        item_id = m.group(2)
        block = [lines[i]]
        i += 1
        # Consume until the next item id or a top-level key.
        while i < len(lines) and not ID_RE.match(lines[i].rstrip("\n")) and not re.match(r"^\S", lines[i]):
            block.append(lines[i])
            i += 1

        opt_idx: list[int] = []
        flow_line = None
        for j, line in enumerate(block):
            stripped = line.rstrip("\n")
            if FLOW_RE.match(stripped):
                flow_line = j
            elif BLOCK_RE.match(stripped):
                k = j + 1
                while k < len(block) and re.match(r"^\s+- ", block[k]):
                    opt_idx.append(k)
                    k += 1

        ans_line = next((j for j, l in enumerate(block) if ANSWER_RE.match(l.rstrip("\n"))), None)
        if ans_line is None:
            out.extend(block)
            continue

        indent, answer = ANSWER_RE.match(block[ans_line].rstrip("\n")).groups()
        answer = int(answer)

        if flow_line is not None:
            pre, body = FLOW_RE.match(block[flow_line].rstrip("\n")).groups()
            options = split_flow(body)
            n = len(options)
            k = offset_for(item_id, n)
            rotated = options[k:] + options[:k]
            block[flow_line] = f"{pre}options: [{', '.join(rotated)}]\n"
        elif opt_idx:
            options = [block[j] for j in opt_idx]
            n = len(options)
            k = offset_for(item_id, n)
            rotated = options[k:] + options[:k]
            for j, line in zip(opt_idx, rotated):
                block[j] = line
        else:
            out.extend(block)
            continue

        block[ans_line] = f"{indent}answer: {(answer - k) % n}\n"
        changed += 1
        out.extend(block)

    path.write_text("".join(out), encoding="utf-8")
    return changed


def main() -> int:
    total = 0
    for path in sorted(Path("packs").glob("*.yaml")) + sorted(Path("packs-private").glob("*.yaml")):
        n = process(path)
        total += n
        print(f"  rotated {n:>3} item(s) in {path}")
    print(f"\n{total} item(s) rotated.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
