import assert from "node:assert/strict";
import { test } from "node:test";

import { itemKey } from "./item-key.ts";
import { planSession } from "./session.ts";
import { replay } from "./schedule.ts";
import type { Item, LoadedPack } from "./types.ts";
import type { ReviewEntry } from "./storage.ts";

function item(id: string, difficulty: 1 | 2 | 3 | 4 | 5 = 2): Item {
  return {
    id,
    type: "multiple-choice",
    difficulty,
    prompt: `Question ${id}?`,
    options: ["a", "b", "c", "d"],
    answer: 0,
    explain: "because",
    provenance: "authored",
  };
}

function loaded(name: string, items: Item[], modes: ("practice" | "companion")[] = ["practice"]): LoadedPack {
  return {
    pack: {
      pack: name,
      version: 1,
      title: name,
      description: "d",
      license: "CC-BY-4.0",
      source: "s",
      modes,
      items,
    },
    path: `/tmp/${name}.yaml`,
    public: true,
  };
}

const NOW = new Date("2026-08-22T09:00:00.000Z");

test("with no history everything is new and the budget is filled", () => {
  const pack = loaded("p", Array.from({ length: 20 }, (_, i) => item(`i${i}`)));
  const plan = planSession({ packs: [pack], mode: "practice", budget: 8, date: "2026-08-22", seed: 1 });
  assert.equal(plan.items.length, 8);
});

test("unseen items are prioritised over items not yet due", () => {
  // The core promise: a session should show you what you have not seen and
  // what you are about to forget, not a reshuffle of everything.
  const items = Array.from({ length: 14 }, (_, i) => item(`i${i}`));
  const pack = loaded("p", items);

  const log: ReviewEntry[] = [];
  for (const at of ["2026-08-22T08:00:00.000Z", "2026-08-22T08:20:00.000Z"]) {
    for (const it of items.slice(0, 10)) {
      const key = itemKey("p", it);
      log.push({ key: key.key, hash: key.hash, correct: true, answeredAt: at });
    }
  }
  const states = replay(log);
  const seen = new Set(log.map((e) => e.key));

  const plan = planSession({
    packs: [pack], mode: "practice", budget: 6, date: "2026-08-22", seed: 7,
    states, now: new Date("2026-08-23T09:00:00.000Z"),
  });

  const fresh = plan.items.filter((i) => !seen.has(i.key.key)).length;
  assert.equal(fresh, 4, "all four unseen items should appear before any not-yet-due one");
});

test("overdue items come before unseen ones", () => {
  // Something you are about to forget is worth more than something new.
  const items = Array.from({ length: 10 }, (_, i) => item(`i${i}`));
  const pack = loaded("p", items);

  const log: ReviewEntry[] = items.slice(0, 4).map((it) => {
    const key = itemKey("p", it);
    return { key: key.key, hash: key.hash, correct: true, answeredAt: "2026-06-01T09:00:00.000Z" };
  });
  const states = replay(log);
  const overdue = new Set(log.map((e) => e.key));

  const plan = planSession({
    packs: [pack], mode: "practice", budget: 4, date: "2026-08-22", seed: 3, states, now: NOW,
  });

  assert.equal(
    plan.items.filter((i) => overdue.has(i.key.key)).length,
    4,
    "the four overdue items should fill a four-item budget",
  );
});

test("focus restricts the session to one pack without discarding the rest", () => {
  const a = loaded("a", Array.from({ length: 5 }, (_, i) => item(`a${i}`)));
  const b = loaded("b", Array.from({ length: 5 }, (_, i) => item(`b${i}`)));

  const plan = planSession({
    packs: [a, b], mode: "practice", budget: 5, date: "2026-08-22", seed: 1, focus: "b",
  });

  assert.ok(plan.items.every((i) => i.packId === "b"));
  assert.deepEqual(plan.topics, ["b"]);
});

test("a mixed session draws from every chosen topic", () => {
  const a = loaded("a", Array.from({ length: 10 }, (_, i) => item(`a${i}`)));
  const b = loaded("b", Array.from({ length: 10 }, (_, i) => item(`b${i}`)));

  const plan = planSession({ packs: [a, b], mode: "practice", budget: 8, date: "2026-08-22", seed: 5 });
  const packs = new Set(plan.items.map((i) => i.packId));
  assert.deepEqual([...packs].sort(), ["a", "b"]);
});

test("planning is deterministic for a given seed", () => {
  const pack = loaded("p", Array.from({ length: 20 }, (_, i) => item(`i${i}`)));
  const args = { packs: [pack], mode: "practice" as const, budget: 8, date: "2026-08-22", seed: 42 };
  assert.deepEqual(
    planSession(args).items.map((i) => i.key.key),
    planSession(args).items.map((i) => i.key.key),
  );
});

test("companion mode opens on the warmup pool", () => {
  // A first question someone gets wrong is the worst possible opening for the
  // audience this mode is for.
  const items = [
    ...Array.from({ length: 3 }, (_, i) => item(`w${i}`, 1)),
    ...Array.from({ length: 10 }, (_, i) => item(`h${i}`, 4)),
  ];
  const plan = planSession({
    packs: [loaded("c", items, ["companion"])],
    mode: "companion", budget: 6, date: "2026-08-22", seed: 1,
  });

  assert.equal(plan.items[0]!.item.difficulty, 1, "the first item must come from the warmup pool");
  assert.ok(plan.items.slice(0, 3).every((i) => i.item.difficulty === 1));
});

test("a budget larger than the corpus yields a shorter session, not a crash", () => {
  const pack = loaded("p", [item("only")]);
  const plan = planSession({ packs: [pack], mode: "practice", budget: 20, date: "2026-08-22", seed: 1 });
  assert.equal(plan.items.length, 1);
  assert.ok(plan.estimatedMinutes >= 1);
});
