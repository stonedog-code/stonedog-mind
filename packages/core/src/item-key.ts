import { contentHash } from "./hash.ts";
import type { Item, ItemKey } from "./types.ts";

/**
 * Identity of an item: `pack:id`, plus a hash of the parts that carry meaning.
 *
 * `explain` is deliberately NOT hashed. Fixing a typo in an explanation must
 * not reset a learner's scheduling history — only a change to what is being
 * asked, or to what counts as correct, should. Without this, an author fixing a
 * question in place silently applies a three-week retention interval to a fact
 * the learner has never seen.
 */
export function itemKey(packId: string, item: Item): ItemKey {
  return {
    key: `${packId}:${item.id}`,
    hash: contentHash(JSON.stringify([item.prompt, item.options, item.answer])),
  };
}
