/**
 * Session planning. Pure: data in, a plan out, no I/O and no clock.
 *
 * The caller fetches a bounded candidate set and passes it in. That boundary is
 * what keeps this testable — a wrong plan still *produces a session*, and
 * reports success while showing the wrong questions, so it needs to be
 * reproducible from a seed.
 */

import { itemKey } from "./item-key.ts";
import type { LoadedPack, Mode, PlannedItem, SessionPlan } from "./types.ts";

/** Roughly how long one item takes, for display only. Never a countdown. */
const SECONDS_PER_ITEM = 45;

/** Mulberry32 — small, seeded, and identical across platforms. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], next: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export interface PlanInput {
  /** Candidate packs, already filtered to the chosen topics and mode. */
  packs: LoadedPack[];
  mode: Mode;
  /** How many items to aim for. */
  budget: number;
  /** Local date as YYYY-MM-DD. Supplied by the caller; core has no clock. */
  date: string;
  seed: number;
  /** When set, plan only from this pack — the "focus on one" case. */
  focus?: string | undefined;
}

/**
 * Build a day's session.
 *
 * Practice mode takes an even spread across the chosen topics and shuffles.
 * Companion mode is different by design, not by tuning: it opens on the warmup
 * pool (difficulty 1) and never escalates sharply, because a scheduler tuned to
 * push someone to the edge of forgetting is exactly wrong for someone who may
 * be quietly worried about their memory.
 */
export function planSession(input: PlanInput): SessionPlan {
  const { mode, budget, date, seed } = input;
  const next = rng(seed);

  const packs = input.focus
    ? input.packs.filter((p) => p.pack.pack === input.focus)
    : input.packs;

  const topics = packs.map((p) => p.pack.pack);

  const pool: PlannedItem[] = packs.flatMap((loaded) =>
    loaded.pack.items.map((item) => ({
      item,
      packId: loaded.pack.pack,
      key: itemKey(loaded.pack.pack, item),
    })),
  );

  let chosen: PlannedItem[];

  if (mode === "companion") {
    // Open on the warmup pool, then gentler items first. No difficulty spike.
    const warmup = shuffled(pool.filter((p) => p.item.difficulty === 1), next);
    const rest = shuffled(pool.filter((p) => p.item.difficulty > 1), next).sort(
      (a, b) => a.item.difficulty - b.item.difficulty,
    );
    chosen = [...warmup.slice(0, 3), ...rest].slice(0, budget);
  } else {
    // Round-robin across topics so a session is a genuine mix, then shuffle so
    // the order does not telegraph which pack a question came from.
    const byTopic = new Map<string, PlannedItem[]>();
    for (const p of pool) {
      if (!byTopic.has(p.packId)) byTopic.set(p.packId, []);
      byTopic.get(p.packId)!.push(p);
    }
    for (const [topic, items] of byTopic) byTopic.set(topic, shuffled(items, next));

    const interleaved: PlannedItem[] = [];
    let added = true;
    while (interleaved.length < budget && added) {
      added = false;
      for (const items of byTopic.values()) {
        const item = items.shift();
        if (item) {
          interleaved.push(item);
          added = true;
          if (interleaved.length >= budget) break;
        }
      }
    }
    chosen = shuffled(interleaved, next);
  }

  return {
    date,
    mode,
    topics,
    budget,
    estimatedMinutes: Math.max(1, Math.round((chosen.length * SECONDS_PER_ITEM) / 60)),
    items: chosen,
    seed,
  };
}

/** A stable seed for a given person-day, so re-opening returns the same plan. */
export function seedFor(date: string, salt = ""): number {
  let h = 2166136261;
  for (const ch of `${date}:${salt}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
