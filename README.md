# stonedog-mind — seed content

Phase-0 quiz content for the `stonedog-mind` daily quiz engine. The engine
itself is not built yet; this is the material it will read, authored and
validated first so the format is proven against real content rather than a
toy example.

## What's here

| | |
|---|---|
| `packs/` | **Public.** CC-BY-4.0 |
| `packs-private/` | **Never committed, never published.** `license: private` |
| `validate_packs.py` | The deterministic quality gates every pack must pass |
| `shuffle_answers.py` | One-off: removed positional bias from the authored content |
| `fix_length_tell.py` | One-off: removed the length tell from correct answers |

**122 items across 8 packs.** Six practice packs (Python, pytest,
Playwright, AWS, C#, Agile) and two gentler packs written for a general audience
(Around the World, Animals).

## Licensing

Code is Apache-2.0; quiz packs are CC-BY-4.0. Each pack declares its own
`license:` and `source:`, which are authoritative for that pack. See
[NOTICE](NOTICE) for why the two differ, and for what this tool is and is not.

## Where your own quizzes go

A quiz is a file. Resolution order, first match wins:

1. `--packs <dir>`
2. `STONEDOG_MIND_PACKS` (colon-separated)
3. `./packs`
4. `~/.stonedog-mind/packs` ← **the default home for your own packs**

For a personal setup that is the whole configuration: drop `.yaml` files in
`~/.stonedog-mind/packs/`. No database, no import step, no account.

## Validating

```bash
python3 validate_packs.py packs packs-private   # 0 = clean
python3 validate_packs.py --self-test           # prove the gates aren't vacuous
```

The self-test plants a violation for every gate and confirms each is caught,
then confirms a healthy pack passes **and** that an innocent phrase is not
falsely flagged. A gate only ever observed passing has not been tested — it has
been run.

`validate_packs.py` always prints the size of the input set. `0 violations over
0 packs` and `0 violations over 157 items` are the same output and different
facts.

## Private packs

`packs-private/` is for packs you may study but may not redistribute — anything
derived from material you obtained legitimately but do not hold the rights to
publish. **Nothing in that directory is tracked by git**, and no such pack is
present in this repository.

Three independent locks enforce it, because any one of them can be removed by
somebody who does not know why it is there:

1. `packs-private/.gitignore` ignores everything in the directory
2. the pack carries `license: private`
3. `validate_packs.py` fails if a private pack appears in a public directory

Proven live — copy a private pack into `packs/` and the validator refuses it.

## Authoring a pack

See any file in `packs/` for the shape. The rules the validator enforces:

- `license` and `source` are mandatory
- `explain` is mandatory on every item — an item that cannot say *why* is not
  fit to teach and not fit to be pleasant
- types are `multiple-choice` and `true-false` (cloze and free-text are deferred)
- `provenance: generated` requires `reviewed_by`, and fails closed without it
- companion packs need at least three `difficulty: 1` warmup items
- no health claims anywhere user-visible — see NOTICE
- companion packs additionally pass a sensitivity screen — nothing about death,
  illness, war or decline

Two failure modes the gates exist to catch, both found in this content on the
first run:

- **Positional bias.** 155 of 157 answers were written at index 0. A candidate
  who always picks A would have scored ~100% and the retention metric would have
  measured nothing while looking healthy.
- **The length tell.** 61 correct answers were conspicuously the longest option,
  because they carried a justifying clause the distractors lacked. The
  justification belongs in `explain`.
