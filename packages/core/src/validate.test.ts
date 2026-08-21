/**
 * Every gate is planted with a violation and observed FAILING, then a healthy
 * pack is observed passing, then an innocent phrase is observed NOT being
 * flagged.
 *
 * A gate that has only ever been seen passing has not been tested — it has been
 * run. And a guard that over-matches is worse than no guard: it trains people
 * to ignore it, so the "does not fire" direction matters as much as the other.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { containsPhrase, normalise, validatePack } from "./validate.ts";
import type { LoadedPack, Pack } from "./types.ts";

function pack(overrides: Partial<Pack> = {}, isPublic = true): LoadedPack {
  const base: Pack = {
    pack: "t",
    version: 1,
    title: "T",
    description: "d",
    license: "CC-BY-4.0",
    source: "s",
    modes: ["practice"],
    items: [
      {
        id: "a",
        type: "multiple-choice",
        difficulty: 2,
        prompt: "What colour is the sky on a clear day?",
        options: ["Blue", "Green", "Red", "Brown"],
        answer: 0,
        explain: "Rayleigh scattering.",
        provenance: "authored",
      },
    ],
  };
  return {
    pack: structuredClone({ ...base, ...overrides }),
    path: "/tmp/t.yaml",
    public: isPublic,
  };
}

function caught(loaded: LoadedPack, needle: string): boolean {
  return validatePack(loaded).some((v) => v.message.includes(needle));
}

test("healthy pack is clean", () => {
  assert.deepEqual(validatePack(pack()), []);
});

test("gate: empty explain", () => {
  const p = pack();
  p.pack.items[0]!.explain = "";
  assert.ok(caught(p, "empty explain"));
});

test("gate: answer index out of range", () => {
  const p = pack();
  p.pack.items[0]!.answer = 9;
  assert.ok(caught(p, "out of range"));
});

test("gate: duplicate options after normalisation", () => {
  const p = pack();
  p.pack.items[0]!.options = ["Blue", "blue", "Red", "Brown"];
  assert.ok(caught(p, "duplicate options"));
});

test("gate: prompt leaks the answer", () => {
  const p = pack();
  p.pack.items[0]!.prompt = "Is the sky Blue on a clear day?";
  assert.ok(caught(p, "leaks the answer"));
});

test("gate: generated item with no reviewer fails closed", () => {
  const p = pack();
  p.pack.items[0]!.provenance = "generated";
  assert.ok(caught(p, "refuses to serve"));
});

test("gate: prohibited health claim", () => {
  const p = pack();
  p.pack.items[0]!.explain = "Good brain training for you.";
  assert.ok(caught(p, "PROHIBITED CLAIM"));
});

test("gate: private pack in a public directory", () => {
  const p = pack({ license: "private" }, true);
  assert.ok(caught(p, "PRIVATE PACK"));
});

test("gate: deferred question type is rejected", () => {
  const p = pack();
  // @ts-expect-error — deliberately planting an unsupported type.
  p.pack.items[0]!.type = "free-text";
  assert.ok(caught(p, "unsupported type"));
});

test("gate: companion pack without a warmup pool", () => {
  const p = pack({ modes: ["companion"] });
  assert.ok(caught(p, "warmup items"));
});

test("gate: companion sensitivity screen", () => {
  const p = pack({ modes: ["companion"] });
  p.pack.items = [
    ...[0, 1, 2].map((i) => ({ ...p.pack.items[0]!, id: `w${i}`, difficulty: 1 as const })),
    { ...p.pack.items[0]!, id: "x", explain: "It was named after a great war." },
  ];
  assert.ok(caught(p, "sensitivity screen"));
});

test("gate: positional bias", () => {
  const p = pack();
  p.pack.items = Array.from({ length: 10 }, (_, i) => ({ ...p.pack.items[0]!, id: `i${i}` }));
  assert.ok(caught(p, "positional bias"));
});

test("gate: answer conspicuously the longest option", () => {
  const p = pack();
  p.pack.items[0]!.options = [
    "Blue, because shorter wavelengths scatter far more in the atmosphere",
    "Green",
    "Red",
    "Brown",
  ];
  assert.ok(caught(p, "conspicuously the longest"));
});

test("the guard does NOT over-match innocent text", () => {
  const p = pack({ modes: ["companion"] });
  p.pack.items = [
    ...[0, 1, 2].map((i) => ({ ...p.pack.items[0]!, id: `w${i}`, difficulty: 1 as const })),
    {
      ...p.pack.items[0]!,
      id: "warm",
      explain: "Penguins huddle for warmth, taking turns towards the windy edge.",
    },
  ];
  assert.equal(
    validatePack(p).some((v) => v.message.includes("sensitivity screen")),
    false,
    "'warmth' and 'towards' must not trip the 'war' screen",
  );
});

test("containsPhrase is word-bounded", () => {
  assert.equal(containsPhrase("a warm hug", "war"), false);
  assert.equal(containsPhrase("a great skill", "kill"), false);
  assert.equal(containsPhrase("the war ended", "war"), true);
});

test("normalise strips diacritics and case", () => {
  assert.equal(normalise("Château"), normalise("chateau"));
});
