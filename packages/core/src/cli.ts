/**
 * `npm run validate` — run the quality gates over the pack directories.
 *
 * Exit codes: 0 clean, 1 violations found, 2 usage error.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { loadPacks } from "./node.ts";
import { validateAll, validatePack } from "./validate.ts";

const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const dirs = (args.length ? args : ["packs", "packs-private"]).map((d) => resolve(d));

for (const dir of dirs) {
  if (!existsSync(dir)) {
    process.stderr.write(`error: ${dir} does not exist\n`);
    process.exit(2);
  }
}

const packs = loadPacks(dirs);

for (const loaded of packs) {
  const violations = validatePack(loaded);
  const name = loaded.path.split(/[\\/]/).pop() ?? loaded.path;
  const scope = loaded.public ? "public " : "private";
  const status = violations.length === 0 ? "OK  " : "FAIL";
  const count = String(loaded.pack.items?.length ?? 0).padStart(3);
  process.stdout.write(`  ${status} ${scope} ${name.padEnd(22)} ${count} items\n`);
}

const report = validateAll(packs);

const total = Object.values(report.answerPositions).reduce((a, b) => a + b, 0);
if (total > 0) {
  process.stdout.write("\nAnswer position across the corpus:\n");
  for (const key of Object.keys(report.answerPositions).map(Number).sort((a, b) => a - b)) {
    const n = report.answerPositions[key]!;
    const share = Math.round((n / total) * 100);
    const flag = share > 40 || share < 12 ? "  <-- skewed" : "";
    process.stdout.write(`  index ${key}: ${String(n).padStart(4)}  (${share}%)${flag}\n`);
  }
}

// Always print the size of the input set. "0 violations over 0 packs" and
// "0 violations over 157 items" are the same output and different facts.
process.stdout.write(
  `\nExamined ${report.itemCount} items across ${report.packCount} pack(s) in ${dirs.length} director(ies).\n`,
);

if (report.violations.length > 0) {
  process.stdout.write(`\n${report.violations.length} violation(s):\n\n`);
  for (const v of report.violations) {
    process.stdout.write(`  - ${v.pack}: ${v.message}\n`);
  }
  process.exit(1);
}

process.stdout.write("No violations.\n");
