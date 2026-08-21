#!/usr/bin/env python3
"""Deterministic quality gates over pack files.

The standalone stand-in for the engine's pack validation, until that exists.
It runs the mechanical gates only — the ones a machine can decide. It cannot
decide whether a question has a single defensible correct answer; that is what
`reviewed_by` records a human doing.

Usage:
    python3 validate_packs.py packs packs-private
    python3 validate_packs.py --self-test      # prove the gates are not vacuous

Exit codes: 0 clean, 1 violations found, 2 usage error.
"""

from __future__ import annotations

import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

import yaml

REQUIRED_PACK_FIELDS = ("pack", "version", "title", "description", "license", "source", "modes")
REQUIRED_ITEM_FIELDS = ("id", "type", "difficulty", "prompt", "options", "answer", "explain", "provenance")
VALID_TYPES = {"multiple-choice", "true-false"}
VALID_MODES = {"practice", "companion"}
VALID_PROVENANCE = {"authored", "imported", "generated"}

# Prohibited health claims. Any occurrence in user-visible text is a violation.
# See NOTICE. A quiz is entertainment; it must never imply a clinical benefit.
BANNED_CLAIMS = (
    "brain training", "cognitive exercise", "mental fitness", "sharpen your memory",
    "boost your memory", "maintain memory", "slow decline", "slows decline",
    "dementia", "alzheimer", "therapy", "therapeutic", "clinically proven",
    "improves cognition", "keeps the mind young", "mental acuity", "brain health",
)

# Sensitivity screen for companion-mode content, which is written for older
# adults. The subject is delight, not decline.
COMPANION_FORBIDDEN = (
    "death", "deaths", "die", "died", "dies", "dying", "kill", "kills", "killed",
    "killing", "war", "wars", "wartime", "battle", "battles", "disease",
    "diseases", "illness", "ill", "extinct", "extinction", "endangered",
    "cancer", "disaster", "massacre", "slaughter", "predator", "prey",
)


def normalise(text: str) -> str:
    """NFKD + casefold + strip diacritics. Never a database collation.

    Collations differ between engines (SQLite NOCASE is ASCII-only), so the
    same answer would grade differently depending on where it ran.
    """
    decomposed = unicodedata.normalize("NFKD", str(text))
    return "".join(c for c in decomposed if not unicodedata.combining(c)).casefold().strip()


def contains_phrase(haystack: str, phrase: str) -> bool:
    """Word-boundary match, not substring.

    Plain `in` over-matches ruinously: 'war' fires on warm, warning and towards;
    'kill' fires on skill; 'died' on studied. An over-matching guard is worse
    than none — it trains people to ignore it, and then a real hit is waved
    through with the noise. Prefix matching is kept for stems like 'alzheimer'
    so 'Alzheimer's' is caught.
    """
    return re.search(rf"\b{re.escape(phrase)}\b", haystack) is not None


def check_pack(path: Path, public: bool) -> list[str]:
    errors: list[str] = []

    def bad(msg: str) -> None:
        errors.append(f"{path.name}: {msg}")

    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        return [f"{path.name}: YAML parse failed: {exc}"]

    if not isinstance(data, dict):
        return [f"{path.name}: top level is not a mapping"]

    # --- pack-level gates ---
    for field in REQUIRED_PACK_FIELDS:
        if not data.get(field):
            bad(f"missing required pack field '{field}'")

    licence = str(data.get("license", ""))
    modes = data.get("modes") or []

    # A private pack must never sit in a public directory.
    if public and licence == "private":
        bad("PRIVATE PACK IN A PUBLIC DIRECTORY — this must never be published")
    if not public and licence != "private":
        bad(f"pack in packs-private/ is not marked private (license: {licence})")

    for mode in modes:
        if mode not in VALID_MODES:
            bad(f"unknown mode '{mode}'")

    items = data.get("items") or []
    if not items:
        bad("pack contains no items")

    is_companion = "companion" in modes
    seen_ids: Counter[str] = Counter()
    answer_positions: Counter[int] = Counter()
    warmup = 0

    # --- item-level gates ---
    for idx, item in enumerate(items):
        label = f"item[{idx}] {item.get('id', '<no id>')}"

        for field in REQUIRED_ITEM_FIELDS:
            if item.get(field) is None:
                bad(f"{label}: missing required field '{field}'")
                break
        else:
            seen_ids[item["id"]] += 1

            if item["type"] not in VALID_TYPES:
                bad(f"{label}: unsupported type '{item['type']}' (cloze/free-text are deferred)")
            if item["provenance"] not in VALID_PROVENANCE:
                bad(f"{label}: unknown provenance '{item['provenance']}'")

            # Generated items are fail-closed without a human reviewer.
            if item["provenance"] == "generated" and not item.get("reviewed_by"):
                bad(f"{label}: provenance 'generated' with no reviewed_by — refuses to serve")

            options = item.get("options") or []
            answer = item.get("answer")

            if len(options) < 2:
                bad(f"{label}: fewer than two options")
            elif not isinstance(answer, int) or not 0 <= answer < len(options):
                bad(f"{label}: answer index {answer!r} out of range for {len(options)} options")
            else:
                answer_positions[answer] += 1

                # Gate 2: distractors distinct after normalisation.
                normalised = [normalise(o) for o in options]
                if len(set(normalised)) != len(normalised):
                    bad(f"{label}: duplicate options after normalisation")

                # Gate 4: the prompt must not contain the answer text.
                answer_text = normalised[answer]
                if len(answer_text) > 3 and answer_text in normalise(item["prompt"]):
                    bad(f"{label}: prompt leaks the answer")

                # Gate 4b: the answer must not be conspicuously the longest option.
                lengths = [len(o) for o in normalised]
                longest = max(lengths)
                if lengths[answer] == longest and sorted(lengths)[-2] * 1.6 < longest:
                    bad(f"{label}: answer is conspicuously the longest option")

            if not str(item.get("explain", "")).strip():
                bad(f"{label}: empty explain — every item must say why")

            difficulty = item.get("difficulty")
            if not isinstance(difficulty, int) or not 1 <= difficulty <= 5:
                bad(f"{label}: difficulty {difficulty!r} outside 1-5")
            elif difficulty == 1:
                warmup += 1

            # Claim lint over every user-visible string.
            visible = normalise(" ".join([item.get("prompt", ""), item.get("explain", ""), *map(str, options)]))
            for phrase in BANNED_CLAIMS:
                if contains_phrase(visible, phrase):
                    bad(f"{label}: PROHIBITED CLAIM '{phrase}' in user-visible text")

            # Sensitivity screen, companion packs only.
            if is_companion:
                for word in COMPANION_FORBIDDEN:
                    if contains_phrase(visible, word):
                        bad(f"{label}: companion-mode sensitivity screen rejects '{word}'")

    for item_id, count in seen_ids.items():
        if count > 1:
            bad(f"duplicate item id '{item_id}' appears {count} times")

    # Companion packs need a warmup pool: a first-time user must be able to
    # start on something easy rather than fail twice in a row.
    if is_companion and warmup < 3:
        bad(f"companion pack has only {warmup} difficulty-1 warmup items (needs >= 3)")

    # Gate 3: positional bias across the pack.
    if answer_positions:
        total = sum(answer_positions.values())
        top_position, top_count = answer_positions.most_common(1)[0]
        if total >= 8 and top_count / total > 0.6:
            bad(f"positional bias: {top_count}/{total} answers at index {top_position}")

    # Also lint the pack's own description, which is user-visible.
    for phrase in BANNED_CLAIMS:
        if contains_phrase(normalise(str(data.get("description", ""))), phrase):
            bad(f"PROHIBITED CLAIM '{phrase}' in pack description")

    return errors


def self_test() -> int:
    """Prove the gates fail on planted violations. A gate only ever observed
    passing has not been tested — it has been run."""
    import tempfile

    base = {
        "pack": "t", "version": 1, "title": "T", "description": "d",
        "license": "CC-BY-4.0", "source": "s", "modes": ["practice"],
        "items": [{
            "id": "a", "type": "multiple-choice", "difficulty": 2,
            "prompt": "What colour is the sky on a clear day?",
            "options": ["Blue", "Green", "Red", "Brown"],
            "answer": 0, "explain": "Rayleigh scattering.", "provenance": "authored",
        }],
    }

    def run(mutate, public=True):
        pack = yaml.safe_load(yaml.safe_dump(base))
        mutate(pack)
        with tempfile.NamedTemporaryFile("w", suffix=".yaml", delete=False) as fh:
            yaml.safe_dump(pack, fh)
            tmp = Path(fh.name)
        try:
            return check_pack(tmp, public=public)
        finally:
            tmp.unlink()

    def drop_explain(p): p["items"][0]["explain"] = ""
    def out_of_range(p): p["items"][0]["answer"] = 9
    def dup_options(p): p["items"][0]["options"] = ["Blue", "blue", "Red", "Brown"]
    def leak(p): p["items"][0]["prompt"] = "Is the sky Blue on a clear day?"
    def unreviewed(p): p["items"][0]["provenance"] = "generated"
    def banned(p): p["items"][0]["explain"] = "Good brain training for you."
    def private_public(p): p["license"] = "private"
    def sensitive(p):
        p["modes"] = ["companion"]
        p["items"] += [dict(p["items"][0], id=f"w{i}", difficulty=1) for i in range(3)]
        p["items"][0]["explain"] = "It was named after a great war."
    def no_warmup(p): p["modes"] = ["companion"]
    def bias(p):
        p["items"] = [dict(p["items"][0], id=f"i{i}") for i in range(10)]
    def deferred_type(p): p["items"][0]["type"] = "free-text"

    planted = [
        ("empty explain", drop_explain, "empty explain"),
        ("answer out of range", out_of_range, "out of range"),
        ("duplicate options", dup_options, "duplicate options"),
        ("prompt leaks answer", leak, "leaks the answer"),
        ("unreviewed generated item", unreviewed, "refuses to serve"),
        ("prohibited claim", banned, "PROHIBITED CLAIM"),
        ("private pack in public dir", private_public, "PRIVATE PACK"),
        ("companion sensitivity", sensitive, "sensitivity screen"),
        ("companion warmup pool", no_warmup, "warmup items"),
        ("positional bias", bias, "positional bias"),
        ("deferred question type", deferred_type, "unsupported type"),
    ]

    failures = 0
    print("Self-test — each gate must FAIL on a planted violation:\n")
    for name, mutate, expected in planted:
        errs = run(mutate)
        caught = any(expected in e for e in errs)
        print(f"  {'PASS' if caught else 'FAIL'}  planted {name:<28} -> {'caught' if caught else 'NOT CAUGHT'}")
        failures += 0 if caught else 1

    def innocent_warm(p):
        p["modes"] = ["companion"]
        p["items"] += [dict(p["items"][0], id=f"w{i}", difficulty=1) for i in range(3)]
        p["items"][0]["explain"] = "Penguins huddle for warmth, taking turns towards the edge."

    over = run(innocent_warm)
    over_caught = any("sensitivity screen" in e for e in over)
    print(f"\n  {'PASS' if not over_caught else 'FAIL'}  innocent 'warmth/towards' -> "
          f"{'not flagged' if not over_caught else 'FALSELY FLAGGED'}")

    clean = run(lambda p: None)
    print(f"\n  {'PASS' if not clean else 'FAIL'}  healthy pack -> {'clean' if not clean else clean}")
    failures += 1 if clean else 0
    failures += 1 if over_caught else 0

    print(f"\n{len(planted) + 2 - failures}/{len(planted) + 2} self-tests passed.")
    return 1 if failures else 0


def main(argv: list[str]) -> int:
    if "--self-test" in argv:
        return self_test()

    dirs = [Path(a) for a in argv[1:]] or [Path("packs"), Path("packs-private")]
    all_errors: list[str] = []
    positions: Counter[int] = Counter()
    pack_count = item_count = 0

    for directory in dirs:
        if not directory.is_dir():
            print(f"error: {directory} is not a directory", file=sys.stderr)
            return 2
        public = directory.name != "packs-private"
        for path in sorted(directory.glob("*.yaml")):
            pack_count += 1
            try:
                data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
            except yaml.YAMLError:
                data = {}
            n = len(data.get("items") or [])
            item_count += n
            for it in data.get("items") or []:
                if isinstance(it.get("answer"), int):
                    positions[it["answer"]] += 1
            errs = check_pack(path, public=public)
            all_errors.extend(errs)
            status = "OK  " if not errs else "FAIL"
            scope = "private" if not public else "public "
            print(f"  {status} {scope} {path.name:<22} {n:>3} items")

    # Corpus-wide answer distribution. The per-pack gate cannot see this:
    # 14 items over 4 options is too small a sample for one pack to look
    # skewed, while the corpus can still be systematically lopsided.
    if positions:
        total_ans = sum(positions.values())
        print("\nAnswer position across the corpus:")
        for pos in sorted(positions):
            share = positions[pos] / total_ans
            flag = "  <-- skewed" if share > 0.40 or share < 0.12 else ""
            print(f"  index {pos}: {positions[pos]:>4}  ({share:.0%}){flag}")
        if any(p / total_ans > 0.40 or p / total_ans < 0.12 for p in positions.values()):
            all_errors.append("corpus-wide answer position is skewed")

    # Always print the size of the input set — a count is the only signal
    # that the set changed. "0 violations over 0 packs" is not a pass.
    print(f"\nExamined {item_count} items across {pack_count} pack(s) in {len(dirs)} director(ies).")

    if all_errors:
        print(f"\n{len(all_errors)} violation(s):\n")
        for err in all_errors:
            print(f"  - {err}")
        return 1

    print("No violations.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
