/**
 * The content contract. These types are the public shape of a pack file, and
 * changing them changes the format every pack on disk is written against.
 */

/** Which experience an item or pack is suitable for. */
export type Mode = "practice" | "companion";

/** Shipped question types. `cloze` and `free-text` are deliberately deferred. */
export type ItemType = "multiple-choice" | "true-false";

export type Provenance = "authored" | "imported" | "generated";

/** 1 (warmup) to 5. Difficulty 1 also forms the companion-mode warmup pool. */
export type Difficulty = 1 | 2 | 3 | 4 | 5;

export interface Item {
  /** Unique within its pack. The global key is `${pack}:${id}` — see itemKey(). */
  id: string;
  type: ItemType;
  difficulty: Difficulty;
  prompt: string;
  options: string[];
  /** Zero-based index into `options`. */
  answer: number;
  /**
   * Why the answer is the answer. Mandatory: an item that cannot say why is
   * not fit to teach and not fit to be pleasant.
   */
  explain: string;
  provenance: Provenance;
  /** Required when provenance is "generated". Serving fails closed without it. */
  reviewed_by?: string;
  tags?: string[];
}

export interface Pack {
  pack: string;
  version: number;
  title: string;
  description: string;
  /** An SPDX id, or the literal "private" for a pack that must never be published. */
  license: string;
  source: string;
  modes: Mode[];
  locale?: string;
  items: Item[];
}

/** A pack plus where it came from, which the validator needs and the engine does not. */
export interface LoadedPack {
  pack: Pack;
  /** Absolute path on disk. */
  path: string;
  /** False for anything under a `packs-private` directory. */
  public: boolean;
}

/**
 * The globally unique identity of an item.
 *
 * Two parts, and both matter. The `pack:id` prefix stops a bare `id: 1` in an
 * imported deck colliding with a generated pack's `id: 1`. The content hash
 * means a *material* edit — a changed prompt or answer — reads as a new item,
 * so its scheduling history starts fresh instead of applying a three-week
 * retention interval to a fact the learner has never seen.
 */
export interface ItemKey {
  key: string;
  hash: string;
}

export interface PlannedItem {
  item: Item;
  packId: string;
  key: ItemKey;
}

export interface SessionPlan {
  /** The local date this plan was built for, as YYYY-MM-DD. */
  date: string;
  mode: Mode;
  /** Topics (pack ids) the plan drew from. */
  topics: string[];
  /** How many items were asked for. The plan may be shorter if content ran out. */
  budget: number;
  /** Rough minutes, for display only. Never rendered as a countdown. */
  estimatedMinutes: number;
  items: PlannedItem[];
  seed: number;
}

export interface Grade {
  correct: boolean;
  chosen: number;
  answer: number;
  explain: string;
}
