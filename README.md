# stonedog-mind

A daily, timeboxed, topic-driven quiz. Pick the topics you care about, get a
short session each morning, take the whole mix or focus on one, and stop
whenever you like.

```bash
npm install
npm run dev          # http://localhost:3210
```

That is the whole setup. No database, no account, no import step. **Node 22.6 or
newer** — the tooling runs TypeScript directly via `--experimental-strip-types`.

Verified from a clean clone: `npm install && npm run gate && npm run dev`.

## What's here

| | |
|---|---|
| `packages/core` | `@stonedogcode/mind-core` — the engine. Pure: session planning, grading, validation, item identity. No React, no styling, no Node builtins |
| `packages/ui` | `@stonedogcode/mind-ui` — the quiz screens, built on `@stonedogcode/style` and `@stonedogcode/theme` |
| `apps/web` | The standalone app. Self-hostable, and the reference consumer of the two packages above |
| `packs/` | 122 items across 8 packs, CC-BY-4.0 |
| `packs-private/` | Never committed, never published |

**Two consumers, one engine.** The standalone app is a thin shell over
`mind-core` and `mind-ui`; an embedding host is another. That is why the core is
headless and the UI is a package rather than part of the app — writing the quiz
screens twice would produce two things to keep in sync, and they would drift.

Reading packs off disk lives behind `@stonedogcode/mind-core/node`, a separate
entry point, so a client component that reaches for `loadPacks` gets a build
error rather than dragging `node:fs` into a browser bundle.

## Where your quizzes go

A quiz is a file. The engine reads files; a database, where there is one, only
ever holds review history. Resolution order:

1. `--packs <dir>`
2. `STONEDOG_MIND_PACKS` (colon-separated)
3. the nearest `packs/` **and `packs-private/`** at or above the working directory
4. `~/.stonedog-mind/packs`

So for a personal setup: drop `.yaml` files in `~/.stonedog-mind/packs/`. Packs
are read per request, so a new file shows up on reload with no restart.

`packs-private/` is loaded like any other source. Those packs are unpublishable,
not unusable — they are usually the ones their owner most wants to study.

## Generating content from a document

Point an LLM at a source document and [`AUTOMATION.md`](AUTOMATION.md):

> *Create quiz content for `onboarding-guide.pdf` using AUTOMATION.md for
> guidance.*

It drafts a pack, self-checks it with `npm run validate:draft`, and hands it
back for review. **The review is enforced, not advised:** an item marked
`provenance: generated` with no `reviewed_by` passes draft validation and is
refused by the normal gate —

```
item[0] vpn-client: provenance 'generated' with no reviewed_by — refuses to serve
```

so a pack only becomes servable once a person has put their name on the items
they checked. No machine check can decide whether a question has a single
defensible correct answer.

## The gate

```bash
npm run gate           # typecheck + tests + pack validation
npm run validate       # the pack quality gates
npm run validate:draft # same, but accepts generated items awaiting review
npm test               # core unit tests + the Panda glob guard
```

Every gate prints the size of its input set. `0 violations over 0 packs` and
`0 violations over 157 items` are the same output and different facts.

The tests plant a violation for every gate and confirm each is caught, then
confirm a healthy pack passes **and** that an innocent phrase is *not* flagged.
A gate that has only ever been seen passing has not been tested — it has been
run. An over-matching guard is worse than none: it trains people to ignore it.

## Two things that fail silently, and their guards

**The Panda include glob.** `@stonedogcode/style` and `@stonedogcode/mind-ui`
ship TypeScript *source*, because Panda extracts styles by statically parsing
source at the consumer's build. A package Panda never parses contributes no CSS
— the page renders, the class names are in the DOM, and there are no rules
behind them. No build error, no warning. npm workspaces hoist to the repo root
when they can, so `./node_modules/...` may match nothing while
`../../node_modules/...` matches; neither is guaranteed, so both are listed.
`apps/web/panda.test.ts` asserts at least one resolves, and reports how many
files it found.

**The PostCSS plugin.** Without `postcss.config.cjs`, Panda generates its
`styled-system/` directory happily and emits no stylesheet into the app — the
same symptom by a different route. `.cjs` and not `.js`, because the workspace
is `"type": "module"`.

## Writing a pack

See any file in `packs/`. The rules the validator enforces:

- `license` and `source` are mandatory
- `explain` is mandatory on every item — an item that cannot say *why* is not
  fit to teach and not fit to be pleasant
- types are `multiple-choice` and `true-false`; cloze and free-text are deferred
- `provenance: generated` requires `reviewed_by`, and fails closed without it
- packs written for a general audience need at least three `difficulty: 1`
  warmup items, so a first-time user starts on something easy
- no health claims anywhere user-visible — see [NOTICE](NOTICE)

Two failure modes worth knowing, both found in this repo's own content on the
gates' first run:

- **Positional bias.** 155 of 157 answers were written at index 0. Always
  picking A would have scored ~100%, and any retention metric built on it would
  have measured nothing while looking healthy.
- **The length tell.** 61 correct answers were conspicuously the longest option,
  because they carried a justifying clause the distractors lacked. The
  justification belongs in `explain`.

## Private packs

`packs-private/` is for packs you may study but may not redistribute. **Nothing
in that directory is tracked by git**, and no such pack is present in this
repository. Three independent locks, because any one of them can be removed by
somebody who does not know why it is there:

1. `packs-private/.gitignore` ignores everything in the directory
2. the pack declares `license: private`
3. the validator fails if a private pack appears in a public directory

## Licensing

Code is Apache-2.0; quiz packs are CC-BY-4.0. Each pack declares its own
`license:` and `source:`, which are authoritative for that pack. See
[NOTICE](NOTICE) for why the two differ, and for what this tool is and is not.
