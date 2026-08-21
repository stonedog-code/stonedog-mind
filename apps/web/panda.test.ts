/**
 * The Panda include globs must resolve to real files.
 *
 * This is the guard for the highest-risk integration detail in the project, and
 * the reason it needs a guard is that the failure has NO other symptom:
 * `@stonedogcode/style` and `@stonedogcode/mind-ui` ship TypeScript source
 * because Panda extracts styles by statically parsing source at the consumer's
 * build. A package Panda never parses contributes no CSS — the page renders,
 * the class names are in the DOM, and there are no rules behind them. No build
 * error, no console warning.
 *
 * npm workspaces hoist to the repo root when they can, so `./node_modules/...`
 * — resolved from here, where panda runs — may match nothing; whether it hoists
 * depends on version conflicts elsewhere in the workspace, so neither location
 * is guaranteed and a single path is a coin flip. Listing both is the fix; this
 * test is what stops both going dead at once.
 *
 * Run: node --experimental-strip-types --test panda.test.ts
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The config is read as TEXT, not imported.
 *
 * Importing it pulls in `@pandacss/dev`, and Node refuses to strip types from
 * anything inside node_modules (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING).
 * Reading the file is also the more honest check: it asserts what is on disk
 * rather than what a module evaluated to.
 */
const configSource = readFileSync(join(here, "panda.config.ts"), "utf8");

/** Expand a glob far enough for "does this match anything" — no dependency. */
function matches(glob: string): number {
  const [base] = glob.split("*");
  const root = resolve(here, base ?? "");
  if (!existsSync(root)) return 0;

  const wantsTsx = glob.endsWith(".tsx");
  let count = 0;

  const walk = (dir: string, depth: number): void => {
    if (depth > 8) return;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      let s;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        if (entry === "node_modules" || entry === "__tests__") continue;
        walk(full, depth + 1);
      } else if (wantsTsx ? entry.endsWith(".tsx") : /\.tsx?$/.test(entry)) {
        count += 1;
      }
    }
  };

  if (statSync(root).isDirectory()) walk(root, 0);
  return count;
}

/**
 * Each entry is a set of alternative locations for ONE package. At least one
 * must resolve. A dead glob alongside a live one is fine and costs nothing —
 * that is exactly the case "list both" is for.
 */
const PACKAGES: Record<string, string[]> = {
  "@stonedogcode/style": [
    "./node_modules/@stonedogcode/style/src/**/*.tsx",
    "../../node_modules/@stonedogcode/style/src/**/*.tsx",
  ],
  "@stonedogcode/mind-ui": [
    "./node_modules/@stonedogcode/mind-ui/src/**/*.tsx",
    "../../node_modules/@stonedogcode/mind-ui/src/**/*.tsx",
    "../../packages/ui/src/**/*.tsx",
  ],
};

test("every source-shipping package resolves to real files", () => {
  for (const [pkg, globs] of Object.entries(PACKAGES)) {
    const counts = globs.map((g) => [g, matches(g)] as const);
    const live = counts.filter(([, n]) => n > 0);

    assert.ok(
      live.length > 0,
      `No glob for ${pkg} matched any file. Panda will parse none of it, and its ` +
        `components will render with class names that have no CSS behind them. ` +
        `Tried:\n${counts.map(([g, n]) => `  ${g} -> ${n}`).join("\n")}`,
    );

    // Report the size of the input set. "0 violations over 0 files" and
    // "0 violations over 50 files" are the same result and different facts.
    for (const [g, n] of live) {
      process.stdout.write(`  ${pkg}: ${g} -> ${n} file(s)\n`);
    }
  }
});

test("the globs under test are the globs the config actually uses", () => {
  // A guard that checks a list nobody uses is worse than none. Every alternative
  // named above must actually appear in panda.config.ts, or this test is
  // asserting something about a fiction.
  for (const globs of Object.values(PACKAGES)) {
    for (const glob of globs) {
      assert.ok(
        configSource.includes(`"${glob}"`),
        `panda.config.ts does not include: ${glob}`,
      );
    }
  }
});

test("the base presets are listed explicitly", () => {
  // Supplying `presets` REPLACES Panda's defaults rather than adding to them.
  // Omit these and the design system's recipes lose the tokens they lean on —
  // silently, with no build error.
  assert.ok(configSource.includes('"@pandacss/preset-base"'), "missing @pandacss/preset-base");
  assert.ok(configSource.includes('"@pandacss/preset-panda"'), "missing @pandacss/preset-panda");
});
