/**
 * Spaced repetition, via FSRS.
 *
 * Pure: entries in, state out. No I/O, no clock — every function that needs
 * "now" takes it as an argument, so a test can hold time still.
 *
 * The scheduler is `ts-fsrs`, not something written here. FSRS has a large
 * literature and an actively maintained implementation; a hand-rolled interval
 * table would be a research project this repo would lose.
 */

import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type Grade } from "ts-fsrs";

import type { ReviewEntry, ReviewState } from "./storage.ts";

/**
 * Fuzz is disabled deliberately.
 *
 * FSRS normally jitters intervals so that a big batch reviewed on one day does
 * not all come back on the same later day. That is a real benefit at scale and
 * a liability here: it makes scheduling non-deterministic, so the same log
 * would produce different due dates on two machines and replay would stop being
 * reproducible. Revisit if a corpus ever gets large enough for clumping to
 * matter.
 */
const scheduler = fsrs(generatorParameters({ enable_fuzz: false }));

/**
 * Answers map to Again / Good, and nothing else.
 *
 * FSRS accepts four grades. Hard and Easy need the learner to report *how* hard
 * recall was, which needs a UI affordance this product does not have — a
 * multiple-choice answer is right or it is not. Offering four buttons that a
 * learner guesses at would feed the scheduler noise dressed as signal.
 */
export function ratingFor(correct: boolean): Grade {
  return correct ? Rating.Good : Rating.Again;
}

function toState(key: string, hash: string, card: Card): ReviewState {
  return {
    key,
    hash,
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: (card.last_review ?? card.due).toISOString(),
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
  };
}

function toCard(state: ReviewState): Card {
  return {
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: 0,
    scheduled_days: state.scheduledDays,
    learning_steps: state.learningSteps,
    reps: state.reps,
    lapses: state.lapses,
    state: state.state,
    last_review: new Date(state.lastReview),
  } as Card;
}

/** Apply one answer to an item's state. `undefined` means it is new. */
export function applyReview(
  previous: ReviewState | undefined,
  entry: ReviewEntry,
): ReviewState {
  const at = new Date(entry.answeredAt);

  // A material edit to the question resets the card. The stored hash is what
  // makes that detectable: same key, different fact.
  const card =
    previous && previous.hash === entry.hash ? toCard(previous) : createEmptyCard(at);

  const result = scheduler.repeat(card, at)[ratingFor(entry.correct)];
  return toState(entry.key, entry.hash, result.card);
}

/**
 * Rebuild all scheduling state from the append-only log.
 *
 * Entries are sorted by `answeredAt` first, so a log that arrived out of order —
 * two devices syncing, a batch replayed late — produces the same result as one
 * written in order. Recompute, never merge.
 */
export function replay(entries: ReviewEntry[]): Map<string, ReviewState> {
  const ordered = [...entries].sort((a, b) => a.answeredAt.localeCompare(b.answeredAt));
  const states = new Map<string, ReviewState>();

  for (const entry of ordered) {
    states.set(entry.key, applyReview(states.get(entry.key), entry));
  }

  return states;
}

/** Is this item worth showing at `now`? Items with no state are always due. */
export function isDue(state: ReviewState | undefined, now: Date): boolean {
  return state === undefined || new Date(state.due) <= now;
}

export interface RetentionReport {
  /**
   * The honest measure: of the answers given to items last seen a week or more
   * earlier, how many were right.
   *
   * Not a streak, and not overall accuracy. Overall accuracy mostly measures
   * how easy the content is; this measures whether anything stuck.
   */
  matured: number;
  maturedCorrect: number;
  /** Every answer, for context — never the headline. */
  total: number;
  totalCorrect: number;
  /** Distinct items seen at least once. */
  itemsSeen: number;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function retention(entries: ReviewEntry[]): RetentionReport {
  const ordered = [...entries].sort((a, b) => a.answeredAt.localeCompare(b.answeredAt));
  const lastSeen = new Map<string, number>();

  let matured = 0;
  let maturedCorrect = 0;
  let totalCorrect = 0;

  for (const entry of ordered) {
    const at = new Date(entry.answeredAt).getTime();
    const previous = lastSeen.get(entry.key);

    if (previous !== undefined && at - previous >= WEEK_MS) {
      matured += 1;
      if (entry.correct) maturedCorrect += 1;
    }

    if (entry.correct) totalCorrect += 1;
    lastSeen.set(entry.key, at);
  }

  return {
    matured,
    maturedCorrect,
    total: ordered.length,
    totalCorrect,
    itemsSeen: lastSeen.size,
  };
}
