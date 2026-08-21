import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { parse as parseYaml } from "yaml";

import type { LoadedPack, Pack } from "./types.ts";

/**
 * Walk up from `from` looking for a directory that contains `packs/`.
 *
 * Without this, the default resolves relative to the current working
 * directory — which is `apps/web` when Next runs it, so the app looks in
 * `apps/web/packs`, finds nothing, and shows an empty state on a repo that is
 * full of packs. `npm run dev` has to be enough on its own; requiring the
 * caller to know where to stand is the same class of problem as requiring an
 * `.env` file a fresh checkout does not have.
 */
function findRepoPacks(from: string): string | undefined {
  let dir = resolve(from);
  for (let i = 0; i < 8; i += 1) {
    if (isDirectory(join(dir, "packs"))) return join(dir, "packs");
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/**
 * Where packs live, in resolution order.
 *
 * Every source that exists is merged into one catalogue — this is not
 * first-match-wins on the *directory*, because someone with a personal pack
 * directory still wants the packs that ship with the app.
 */
export function packDirectories(explicit?: string | undefined): string[] {
  if (explicit) return [resolve(explicit)];

  const fromEnv = process.env["STONEDOG_MIND_PACKS"];
  if (fromEnv) return fromEnv.split(":").filter(Boolean).map((d) => resolve(d));

  const dirs: string[] = [];
  const repo = findRepoPacks(process.cwd());
  if (repo) dirs.push(repo);
  dirs.push(join(homedir(), ".stonedog-mind", "packs"));
  return dirs;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Parse one pack file. Throws on unreadable YAML; validation is separate. */
export function loadPackFile(path: string, isPublic: boolean): LoadedPack {
  const raw = parseYaml(readFileSync(path, "utf8")) as Pack;
  return { pack: raw, path, public: isPublic };
}

/**
 * Load every `.yaml` pack under the given directories.
 *
 * A directory named `packs-private` marks its packs as non-public, which is
 * what lets the validator refuse a private pack that has wandered somewhere it
 * can be published from.
 */
export function loadPacks(dirs: string[]): LoadedPack[] {
  const loaded: LoadedPack[] = [];

  for (const dir of dirs) {
    if (!isDirectory(dir)) continue;
    const isPublic = !dir.split(/[\\/]/).includes("packs-private");

    for (const entry of readdirSync(dir).sort()) {
      if (!entry.endsWith(".yaml") && !entry.endsWith(".yml")) continue;
      loaded.push(loadPackFile(join(dir, entry), isPublic));
    }
  }

  return loaded;
}

/** Only packs suitable for a mode, and only ones that actually have items. */
export function packsForMode(packs: LoadedPack[], mode: string): LoadedPack[] {
  return packs.filter(
    (p) => Array.isArray(p.pack.modes) && p.pack.modes.includes(mode as never) && p.pack.items?.length,
  );
}
