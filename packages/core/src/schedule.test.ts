import assert from "node:assert/strict";
import { test } from "node:test";

import { applyReview, isDue, replay, retention } from "./schedule.ts";
import type { ReviewEntry } from "./storage.ts";

const entry = (over: Partial<ReviewEntry> = {}): ReviewEntry => ({
  key: "pack:item",
  hash: "abc123",
  correct: true,
  answeredAt: "2026-01-01T09:00:00.000Z",
  ...over,
});

test("a correct answer schedules the item into the future", () => {
  const state = applyReview(undefined, entry());
  assert.ok(
    new Date(state.due) > new Date("2026-01-01T09:00:00.000Z"),
    "a recalled item must not still be due",
  );
  assert.equal(state.reps, 1);
  assert.equal(state.lapses, 0);
});

test("a wrong answer brings the item back almost immediately", () => {
  const wrong = applyReview(undefined, entry({ correct: false }));
  const right = applyReview(undefined, entry({ correct: true }));
  assert.ok(
    new Date(wrong.due) < new Date(right.due),
    "a missed item must come back sooner than a recalled one",
  );
});

test("successive correct answers lengthen the interval", () => {
  // The whole point of spaced repetition. If this ever stops holding, the
  // scheduler is not scheduling and every retention number is noise.
  const first = applyReview(undefined, entry({ answeredAt: "2026-01-01T09:00:00.000Z" }));
  const second = applyReview(first, entry({ answeredAt: first.due }));
  const third = applyReview(second, entry({ answeredAt: second.due }));

  const gap = (from: string, to: string) => new Date(to).getTime() - new Date(from).getTime();
  assert.ok(
    gap(second.lastReview, second.due) > gap(first.lastReview, first.due),
    "second interval should exceed the first",
  );
  assert.ok(
    gap(third.lastReview, third.due) > gap(second.lastReview, second.due),
    "third interval should exceed the second",
  );
});

test("a lapse is counted and shortens the interval", () => {
  const first = applyReview(undefined, entry());
  const second = applyReview(first, entry({ answeredAt: first.due }));
  const lapsed = applyReview(second, entry({ answeredAt: second.due, correct: false }));

  assert.equal(lapsed.lapses, 1);
  const gap = (s: { lastReview: string; due: string }) =>
    new Date(s.due).getTime() - new Date(s.lastReview).getTime();
  assert.ok(gap(lapsed) < gap(second), "a lapse must shorten the interval");
});

test("a changed content hash resets the card", () => {
  // A material edit means the item asks a different question. Applying a
  // three-week interval to a fact the learner has never seen is a silent,
  // permanent corruption — this is the guard against it.
  const mature = applyReview(applyReview(undefined, entry()), entry({ answeredAt: "2026-01-08T09:00:00.000Z" }));
  assert.ok(mature.reps > 1);

  const edited = applyReview(mature, entry({ hash: "different", answeredAt: "2026-01-09T09:00:00.000Z" }));
  assert.equal(edited.reps, 1, "an edited item must start over");
  assert.equal(edited.hash, "different");
});

test("replay is order-independent", () => {
  // The log may arrive out of order — two devices, a late sync. Recomputing
  // from a sorted log must give the same answer either way; merging
  // incrementally would not.
  const entries = [
    entry({ answeredAt: "2026-01-01T09:00:00.000Z", correct: true }),
    entry({ answeredAt: "2026-01-05T09:00:00.000Z", correct: false }),
    entry({ answeredAt: "2026-01-09T09:00:00.000Z", correct: true }),
  ];

  const forward = replay(entries).get("pack:item")!;
  const shuffled = replay([entries[2]!, entries[0]!, entries[1]!]).get("pack:item")!;

  assert.deepEqual(forward, shuffled);
});

test("replay of an empty log yields no state", () => {
  assert.equal(replay([]).size, 0);
});

test("isDue treats an unseen item as due", () => {
  assert.equal(isDue(undefined, new Date("2026-01-01")), true);
});

test("isDue respects the scheduled date", () => {
  const state = applyReview(undefined, entry());
  assert.equal(isDue(state, new Date("2026-01-01T09:00:01.000Z")), false);
  assert.equal(isDue(state, new Date("2030-01-01T00:00:00.000Z")), true);
});

test("retention counts only answers to items last seen a week or more earlier", () => {
  const report = retention([
    // Same day — not matured, so it must not count either way.
    entry({ key: "a", answeredAt: "2026-01-01T09:00:00.000Z", correct: true }),
    entry({ key: "a", answeredAt: "2026-01-01T18:00:00.000Z", correct: false }),
    // Eight days later — matured, and correct.
    entry({ key: "a", answeredAt: "2026-01-09T09:00:00.000Z", correct: true }),
    // A different item, matured and wrong.
    entry({ key: "b", answeredAt: "2026-01-01T09:00:00.000Z", correct: true }),
    entry({ key: "b", answeredAt: "2026-01-20T09:00:00.000Z", correct: false }),
  ]);

  assert.equal(report.matured, 2);
  assert.equal(report.maturedCorrect, 1);
  assert.equal(report.itemsSeen, 2);
  assert.equal(report.total, 5);
});

test("retention reports nothing rather than 100% on an empty log", () => {
  // A metric that reads perfectly on no data is worse than no metric.
  const report = retention([]);
  assert.equal(report.matured, 0);
  assert.equal(report.total, 0);
});
