import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { FileStore } from "./store-fs.ts";
import type { ReviewEntry } from "./storage.ts";

const logPath = () => join(mkdtempSync(join(tmpdir(), "mind-store-")), "reviews.jsonl");

const entry = (over: Partial<ReviewEntry> = {}): ReviewEntry => ({
  key: "pack:item",
  hash: "h",
  correct: true,
  answeredAt: "2026-01-01T09:00:00.000Z",
  ...over,
});

test("an appended answer survives a new store instance", () => {
  const path = logPath();
  return (async () => {
    await new FileStore(path).append(entry());
    // A different instance, as a later request would be.
    const log = await new FileStore(path).getLog();
    assert.equal(log.length, 1);
    assert.equal(log[0]!.key, "pack:item");
  })();
});

test("state is derived from the log, and an answer moves the due date", async () => {
  const path = logPath();
  const store = new FileStore(path);
  await store.append(entry());

  const state = (await store.getStates()).get("pack:item");
  assert.ok(state, "expected state for the answered item");
  assert.ok(new Date(state.due) > new Date("2026-01-01T09:00:00.000Z"));
});

test("getStates bounds its result to the keys asked for", async () => {
  const path = logPath();
  const store = new FileStore(path);
  await store.append(entry({ key: "a:1" }));
  await store.append(entry({ key: "b:2" }));

  const scoped = await store.getStates(["a:1"]);
  assert.deepEqual([...scoped.keys()], ["a:1"]);
  assert.equal((await store.getStates()).size, 2);
});

test("a missing log reads as empty rather than throwing", async () => {
  const store = new FileStore(join(tmpdir(), "definitely-not-here", "reviews.jsonl"));
  assert.deepEqual(await store.getLog(), []);
  assert.equal((await store.getStates()).size, 0);
});

test("a truncated final line costs one answer, not the whole history", async () => {
  // The normal way this happens is a process killed mid-append. Losing the
  // partial write is right; refusing to start is not.
  const path = logPath();
  const store = new FileStore(path);
  await store.append(entry({ key: "a:1" }));
  await store.append(entry({ key: "b:2" }));
  writeFileSync(path, `${(await store.getLog()).map((e) => JSON.stringify(e)).join("\n")}\n{"key":"c:3","ha`);

  const log = await new FileStore(path).getLog();
  assert.equal(log.length, 2, "the two intact entries must survive");
});
