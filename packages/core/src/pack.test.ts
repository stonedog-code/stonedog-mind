import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { loadPacks, packDirectories } from "./node.ts";

function scratchRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "mind-packs-"));
  mkdirSync(join(root, "packs"));
  mkdirSync(join(root, "packs-private"));
  const yaml = (name: string, licence: string) =>
    `pack: ${name}\nversion: 1\ntitle: ${name}\ndescription: d\n` +
    `license: ${licence}\nsource: s\nmodes: [practice]\nitems: []\n`;
  writeFileSync(join(root, "packs", "open.yaml"), yaml("open", "CC-BY-4.0"));
  writeFileSync(join(root, "packs-private", "secret.yaml"), yaml("secret", "private"));
  return root;
}

test("packs-private is in the default resolution order", () => {
  // Private packs are exactly the ones their owner most wants to study — an
  // internal guide, a syllabus they bought. Leaving them out meant a pack
  // validated cleanly and then never appeared in the app.
  const root = scratchRepo();
  const cwd = process.cwd();
  try {
    process.chdir(root);
    const dirs = packDirectories();
    assert.ok(dirs.some((d) => d.endsWith("packs")), "packs/ missing");
    assert.ok(dirs.some((d) => d.endsWith("packs-private")), "packs-private/ missing");
  } finally {
    process.chdir(cwd);
  }
});

test("resolution walks up from a subdirectory", () => {
  // Next runs with cwd = apps/web, not the repo root.
  const root = scratchRepo();
  const nested = join(root, "apps", "web");
  mkdirSync(nested, { recursive: true });
  const cwd = process.cwd();
  try {
    process.chdir(nested);
    assert.ok(packDirectories().some((d) => d === join(root, "packs")));
  } finally {
    process.chdir(cwd);
  }
});

test("packs under packs-private are marked non-public", () => {
  const root = scratchRepo();
  const loaded = loadPacks([join(root, "packs"), join(root, "packs-private")]);
  assert.equal(loaded.find((p) => p.pack.pack === "open")?.public, true);
  assert.equal(loaded.find((p) => p.pack.pack === "secret")?.public, false);
});

test("an explicit directory overrides everything else", () => {
  const root = scratchRepo();
  assert.deepEqual(packDirectories(join(root, "packs")), [join(root, "packs")]);
});
