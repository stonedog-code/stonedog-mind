# AUTOMATION.md — generating quiz content from a source document

Guidance for an LLM asked to turn a document into a stonedog-mind pack.

> **Typical prompt:** *"Create quiz content for `onboarding-guide.pdf` using
> AUTOMATION.md for guidance."*

You are producing a **draft**. A person reviews it before anyone is quizzed on
it. That is not a formality — see [Why a human signs off](#why-a-human-signs-off).

---

## 0. Before anything else: where does this pack belong?

**Get this wrong and you have published someone else's copyrighted material.**
Decide first, because it determines the directory and the `license:` field.

| The source is… | Directory | `license:` |
|---|---|---|
| **An internal company document** — onboarding guide, runbook, product spec, anything from an employer's intranet | `packs-private/` | `private` |
| **A book, paid course, exam syllabus, vendor PDF** you legitimately obtained but do not own | `packs-private/` | `private` |
| Public documentation with a permissive licence (MIT, Apache, CC-BY) | `packs/` | that licence's SPDX id |
| Your own original knowledge, written from scratch | `packs/` | `CC-BY-4.0` |

**When in doubt, `packs-private/`.** Nothing in that directory is tracked by
git, so a private pack cannot be pushed by accident. The reverse mistake — a
private pack in `packs/` — is caught by the validator, but only if someone runs
it.

For the common case (an employee quizzing themselves on an internal guide) the
answer is always `packs-private/` and `license: private`.

Set `source:` to something a human can trace back — the document title and
version, not a filesystem path.

---

## 1. The workflow

```
read the source  →  draft items  →  npm run validate:draft  →  human review  →  npm run validate
                          ↑                    │
                          └────── fix ─────────┘
```

1. **Read the whole source first.** Do not draft as you read — you will
   over-weight the first few pages.
2. **List what the reader is supposed to be able to *do*** after reading it.
   Those are your items. A document's headings are a table of contents, not a
   syllabus.
3. **Draft items** against §3 and §4.
4. **Write the file** to the right directory (§0).
5. **Run `npm run validate:draft`.** It must report **No violations**. If it
   does not, fix and repeat — do not hand over a draft that fails its own gate.
6. **Report to the human**: how many items, which sections of the source are
   covered, which are *not*, and anything you were unsure about.

---

## 2. The file format

```yaml
pack: onboarding-guide            # kebab-case id, unique, matches the filename
version: 1                        # bump on any material change to an item
title: Acme Onboarding Guide      # what a person sees in the topic picker
description: The first-week guide — accounts, environments, who to ask.
license: private                  # §0
source: "Acme Onboarding Guide v4.2 (internal), read 2026-08-21"
modes: [practice]                 # see below
locale: en-GB
items:
  - id: vpn-client                # unique WITHIN this pack; kebab-case
    type: multiple-choice         # or true-false
    difficulty: 2                 # 1..5
    tags: [accounts, section-3]   # optional; use them to record source sections
    prompt: Which VPN client does Acme issue to new starters?
    options: ["Tunnelblick", "AnyConnect", "OpenVPN GUI", "WireGuard"]
    answer: 1                     # ZERO-BASED index into options
    explain: >-
      AnyConnect, pushed automatically on first login. Section 3.2 also notes
      that the profile has to be selected manually the first time.
    provenance: generated         # you are an LLM: always `generated`
    # reviewed_by: <-- do NOT add this. Only a human who has checked the item may.
```

**`modes`** — use `[practice]` for anything work-related. `companion` is a
different product mode with its own content rules (unscored, no time pressure,
nothing about illness or decline); do not put a product manual in it.

---

## 3. The rules the validator enforces

Run `npm run validate:draft` and it will tell you. In advance:

| Rule | Why |
|---|---|
| `explain` on every item, non-empty | An item that cannot say *why* is not fit to teach. It is also the only thing that makes a wrong answer useful |
| Exactly one correct answer, `answer` in range | — |
| Options distinct after normalisation | "Sign-in" and "sign in" are the same option |
| The prompt must not contain the answer text | Free marks |
| The correct answer must not be conspicuously the longest | See §4 — this is the one you will get wrong |
| Answer position varied across the pack | See §4 — this is the other one |
| `difficulty` 1–5 | 1 is warmup |
| No health claims anywhere user-visible | This is a quiz, not a wellbeing product. See NOTICE |
| Types: `multiple-choice`, `true-false` only | Cloze and free-text are deferred |

---

## 4. The two mistakes an LLM will make

These are not hypothetical. The packs already in this repo were written by an
LLM and the gates found **74 violations on their first run**. Sixty-nine of the
74 were these two mistakes, repeated:

### Positional bias — 155 of 157 answers at index 0

Writing the correct answer first is the natural thing to do and it destroys the
pack: anyone who always picks the first option scores ~100% without reading
anything, and every retention number built on it is noise.

**Vary `answer` deliberately.** Aim for a roughly even spread across 0–3. Check
your own work before running the validator — count them.

### The length tell — 61 items

The correct answer ends up longest because it carries a justification the
distractors lack:

```yaml
# BAD — the answer is twice the length of every distractor
options:
  - "AnyConnect, which Acme pushes automatically on first login so new starters need no setup"
  - "Tunnelblick"
  - "OpenVPN GUI"
  - "WireGuard"

# GOOD — comparable lengths; the reasoning moved to `explain`, where it belongs
options: ["Tunnelblick", "AnyConnect", "OpenVPN GUI", "WireGuard"]
explain: >-
  AnyConnect, pushed automatically on first login, so a new starter needs no
  setup beyond selecting the profile once.
```

**The option is the claim. The justification goes in `explain`.**

---

## 5. What makes a question worth asking

The validator checks form. It cannot check whether a question is any good.

**Ask about what the reader must be able to do**, not what the document happens
to state.

```yaml
# WEAK — tests whether you noticed a sentence
prompt: How many sections does the onboarding guide contain?

# STRONG — tests whether you could act
prompt: Your laptop cannot reach the staging database on your first morning. Per the guide, what is the first thing to check?
```

**Distractors must be plausible and wrong.** A distractor nobody would pick is a
wasted option — it turns a 4-way question into a 2-way one.

```yaml
# WEAK — three obvious throwaways
options: ["The VPN profile", "A banana", "The colour of the laptop", "Tuesday"]

# STRONG — every option is something a new starter might genuinely believe
options: ["The VPN profile", "The database password", "The staging hostname", "Their SSH key"]
```

**Every fact must come from the source.** If you cannot point to where the
source says it, do not write the item. Do not fill gaps from general knowledge —
an item that is true of the world but false of *this* product teaches the reader
something that will get them into trouble. When the source is ambiguous, say so
in your report rather than guessing.

**Do not quote the source at length.** Write original questions about it. For a
copyright-restricted source this matters legally as well as pedagogically.

---

## 6. How much to write

| Source | Items |
|---|---|
| A short guide (5–15 pages) | 12–20 |
| A substantial manual (50+ pages) | 30–50, and say which sections you skipped |

**Do not pad.** Twenty good items beat sixty where forty are trivia. A session
is ~20 items, so twenty is already a full morning.

**Difficulty spread**: mostly 2–3, a few 1s to open on, a couple of 4s. Reserve
5 for genuinely hard recall.

**Batch large jobs.** If a source would yield more than ~30 items, write the
first 20 and stop. A review queue nobody can clear is a queue whose items never
reach the learner — the feature fails by succeeding too hard.

---

## 7. Self-check before handing over

```bash
npm run validate:draft        # must print "No violations"
```

Then check by eye what no gate can:

- [ ] Is every fact traceable to the source?
- [ ] Are the answer indices spread across 0–3?
- [ ] Could someone pick the right answer from length or phrasing alone?
- [ ] Is every distractor something a real learner might believe?
- [ ] Does every `explain` teach something, rather than restating the answer?
- [ ] Is the pack in the right directory with the right `license:` (§0)?

---

## 8. Why a human signs off

`provenance: generated` with no `reviewed_by` **fails the normal gate**:

```
item[0] vpn-client: provenance 'generated' with no reviewed_by — refuses to serve
```

That is deliberate, and it is the one rule you must not work around. **Never add
`reviewed_by` yourself.** It is the record of a person having read the item and
agreed with it.

No machine check can decide whether a question has a single defensible correct
answer. And the failure mode is worse than a wasted question: a confidently
wrong item teaches the wrong thing to someone who trusted it, and they find out
when it matters. For an internal product guide, that means someone doing the
wrong thing in production having "learned" it from you.

So: draft, self-check, hand over. A person adds `reviewed_by: <name>` to the
items they have checked, and only then does `npm run validate` pass and the pack
become servable.

---

## 9. Report back like this

> Drafted 18 items for **Acme Onboarding Guide v4.2** into
> `packs-private/onboarding-guide.yaml`, marked `license: private` because the
> source is an internal document.
>
> `npm run validate:draft` — No violations. Answer positions: 5/4/5/4.
>
> Covered: accounts and access (§2), environments (§3), the deploy path (§5).
> **Not covered:** §4 (org chart — names change, and recall of a name is not a
> skill) and §7 (a screenshot walkthrough with no text to quiz).
>
> Two items I was unsure about and flagged in comments: §3.2 gives two different
> default ports on consecutive pages, and §5 refers to a runbook I did not have.
>
> Ready for review — add `reviewed_by` to the items you have checked.
