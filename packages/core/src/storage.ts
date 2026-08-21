/**
 * The storage seam. Types and an interface only — no implementation, and
 * nothing in `core` ever calls it.
 *
 * This is what lets one engine serve two data planes: a self-hosted app writing
 * a file, and an embedding host writing its own database with its own tenant
 * scoping. The shell fetches, the core decides.
 */

/**
 * One answer, as it happened. Append-only: entries are never edited or deleted.
 *
 * Scheduling state is *derived* from this log rather than stored alongside it
 * and mutated. Recomputing from an ordered log is deterministic; merging
 * incremental updates from two devices is not, and gets silently wrong rather
 * than loudly wrong.
 */
export interface ReviewEntry {
  /** `pack:id` — the global item key. */
  key: string;
  /**
   * The item's content hash at the moment it was answered.
   *
   * If this differs from the item's hash today, the question has materially
   * changed and this entry describes a different fact. Replay starts the card
   * over rather than applying a three-week interval to something the learner
   * has never seen.
   */
  hash: string;
  /** true = recalled, false = did not. */
  correct: boolean;
  /** ISO-8601 instant. */
  answeredAt: string;
  /** Optional; only meaningful once more than one device is in play. */
  device?: string;
}

/** Scheduling state for one item, derived from the log. */
export interface ReviewState {
  key: string;
  hash: string;
  /** ISO-8601 instant at which this item is next worth showing. */
  due: string;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  /** ts-fsrs card state: 0 New, 1 Learning, 2 Review, 3 Relearning. */
  state: number;
  lastReview: string;
  /**
   * How many days the last interval was scheduled for.
   *
   * Part of the scheduler's own bookkeeping. Persisted because a state that
   * cannot rebuild the card exactly is a state that silently reschedules
   * everything differently on reload.
   */
  scheduledDays: number;
  /**
   * Which learning step the card is on.
   *
   * Easy to think of as an internal detail and drop — and dropping it is a
   * silent, total failure: the card never graduates out of the learning steps,
   * so every item comes back in ten minutes forever, intervals never grow, and
   * the app looks like it is working. Found by a test asserting that successive
   * correct answers lengthen the interval.
   */
  learningSteps: number;
}

export interface StorageAdapter {
  /** Record one answer. Must be durable before it resolves. */
  append(entry: ReviewEntry): Promise<void>;

  /**
   * Current scheduling state, keyed by item key.
   *
   * `keys` bounds the read: a session needs state for the items it is
   * considering, not for the whole history. Passing no keys returns everything,
   * which is what the stats view wants.
   */
  getStates(keys?: string[]): Promise<Map<string, ReviewState>>;

  /** The raw log, in the order it was written. Used for stats and for replay. */
  getLog(): Promise<ReviewEntry[]>;
}
