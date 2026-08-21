import { normalise } from "./validate.ts";
import type { Grade, Item } from "./types.ts";

/**
 * Grade one answer.
 *
 * Index comparison for the shipped types. The text path exists for when cloze
 * and free-text land: normalisation happens here, in application code, never in
 * a database collation — see `normalise`.
 */
export function grade(item: Item, chosen: number): Grade {
  return {
    correct: chosen === item.answer,
    chosen,
    answer: item.answer,
    explain: item.explain,
  };
}

/** Text equivalence, for the deferred free-text type. Exported so it is tested. */
export function textMatches(given: string, expected: string): boolean {
  return normalise(given) === normalise(expected);
}
