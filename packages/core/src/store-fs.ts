/**
 * A `StorageAdapter` backed by an append-only JSONL file.
 *
 * Node-only, so it lives behind the `./node` entry point with pack loading.
 *
 * Why a file and not SQLite: the log is append-only and read whole, which is
 * the one access pattern a file serves as well as a database. No native module,
 * no migration, no daemon — and the data stays greppable, which matters when
 * the thing being stored is a record of what a person got wrong. A host with a
 * database implements this same interface over it instead.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

import { replay } from "./schedule.ts";
import type { ReviewEntry, ReviewState, StorageAdapter } from "./storage.ts";

/**
 * Where the review log lives.
 *
 * Deliberately NOT inside the repo. The log is personal data — a record of what
 * you keep getting wrong — and putting it in a working tree is how it ends up
 * in a commit. `STONEDOG_MIND_HOME` overrides for tests and for anyone who
 * wants it somewhere else.
 */
export function reviewLogPath(): string {
  const home = process.env["STONEDOG_MIND_HOME"] ?? join(homedir(), ".stonedog-mind");
  return join(home, "reviews.jsonl");
}

export class FileStore implements StorageAdapter {
  /*
    An explicit field, not a TypeScript parameter property.

    `constructor(private readonly path: string)` is a construct that EMITS code
    rather than only declaring a type, so Node's strip-only type stripping —
    which the whole toolchain runs on — refuses it outright. Same for enums and
    namespaces. Worth knowing before reaching for any of them.
  */
  private readonly path: string;

  constructor(path: string = reviewLogPath()) {
    this.path = path;
  }

  private read(): ReviewEntry[] {
    if (!existsSync(this.path)) return [];

    const entries: ReviewEntry[] = [];
    for (const [i, line] of readFileSync(this.path, "utf8").split("\n").entries()) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line) as ReviewEntry);
      } catch {
        // One unparseable line must not cost the whole history. A truncated
        // final line is the normal case — a process killed mid-append — and
        // dropping it is right. Anything else is worth knowing about, but not
        // worth refusing to start over.
        process.stderr.write(`stonedog-mind: skipping unparseable review log line ${i + 1}\n`);
      }
    }
    return entries;
  }

  async append(entry: ReviewEntry): Promise<void> {
    mkdirSync(dirname(this.path), { recursive: true });
    // One JSON object per line, written with a synchronous append so a crash
    // mid-session loses at most the answer being written.
    appendFileSync(this.path, `${JSON.stringify(entry)}\n`, "utf8");
  }

  async getStates(keys?: string[]): Promise<Map<string, ReviewState>> {
    const all = replay(this.read());
    if (!keys) return all;

    const wanted = new Set(keys);
    return new Map([...all].filter(([key]) => wanted.has(key)));
  }

  async getLog(): Promise<ReviewEntry[]> {
    return this.read();
  }
}
