/**
 * Deterministic quality gates over packs.
 *
 * These are the mechanical checks — the ones a machine can decide. No gate here
 * can tell whether a question has a single defensible correct answer; that is
 * what `reviewed_by` records a human doing.
 *
 * This lives in `core` rather than in a standalone script on purpose. The
 * engine has to validate a pack before serving it, and a second implementation
 * elsewhere would be a second source of truth for the same rules — which drift
 * apart quietly, because nothing compares them.
 */

import type { Item, LoadedPack, Mode } from "./types.ts";

const REQUIRED_PACK_FIELDS = [
  "pack", "version", "title", "description", "license", "source", "modes",
] as const;

const REQUIRED_ITEM_FIELDS = [
  "id", "type", "difficulty", "prompt", "options", "answer", "explain", "provenance",
] as const;

const VALID_TYPES = new Set(["multiple-choice", "true-false"]);
const VALID_MODES = new Set<Mode>(["practice", "companion"]);
const VALID_PROVENANCE = new Set(["authored", "imported", "generated"]);

/**
 * Prohibited health claims. A quiz is entertainment; it must never imply a
 * clinical benefit. See NOTICE.
 */
export const BANNED_CLAIMS = [
  "brain training", "cognitive exercise", "mental fitness", "sharpen your memory",
  "boost your memory", "maintain memory", "slow decline", "slows decline",
  "dementia", "alzheimer", "therapy", "therapeutic", "clinically proven",
  "improves cognition", "keeps the mind young", "mental acuity", "brain health",
];

/**
 * Sensitivity screen for companion-mode content, which is written for older
 * adults. The subject is delight, not decline.
 */
export const COMPANION_FORBIDDEN = [
  "death", "deaths", "die", "died", "dies", "dying", "kill", "kills", "killed",
  "killing", "war", "wars", "wartime", "battle", "battles", "disease",
  "diseases", "illness", "ill", "extinct", "extinction", "endangered",
  "cancer", "disaster", "massacre", "slaughter", "predator", "prey",
];

/**
 * NFKD + casefold + strip diacritics.
 *
 * Never a database collation. SQLite's NOCASE is ASCII-only while Postgres uses
 * full system collations, so a DB-side comparison would grade "château" against
 * "Chateau" differently depending on where it ran — the same answer, two
 * verdicts. Doing it here means one verdict everywhere.
 */
export function normalise(text: unknown): string {
  return String(text)
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Word-boundary match, not substring.
 *
 * Plain `includes` over-matches ruinously: "war" fires on warm, warning and
 * towards; "kill" fires on skill; "ill" on still. An over-matching guard is
 * worse than none — it trains people to ignore it, and then a real hit is waved
 * through with the noise. Word variants that genuinely matter ("extinction",
 * "killed") are listed explicitly rather than caught by a prefix.
 */
export function containsPhrase(haystack: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "u").test(haystack);
}

export interface Violation {
  pack: string;
  message: string;
}

export interface ValidationReport {
  violations: Violation[];
  packCount: number;
  itemCount: number;
  /** How many answers sat at each option index, across everything examined. */
  answerPositions: Record<number, number>;
}

function checkItem(
  item: Item,
  index: number,
  isCompanion: boolean,
  bad: (m: string) => void,
  countPosition: (i: number) => void,
): { warmup: boolean } {
  const label = `item[${index}] ${item?.id ?? "<no id>"}`;

  for (const field of REQUIRED_ITEM_FIELDS) {
    if (item?.[field] === undefined || item[field] === null) {
      bad(`${label}: missing required field '${field}'`);
      return { warmup: false };
    }
  }

  if (!VALID_TYPES.has(item.type)) {
    bad(`${label}: unsupported type '${item.type}' (cloze/free-text are deferred)`);
  }
  if (!VALID_PROVENANCE.has(item.provenance)) {
    bad(`${label}: unknown provenance '${item.provenance}'`);
  }

  // Generated items are fail-closed without a human reviewer.
  if (item.provenance === "generated" && !item.reviewed_by) {
    bad(`${label}: provenance 'generated' with no reviewed_by — refuses to serve`);
  }

  const options = item.options ?? [];
  if (options.length < 2) {
    bad(`${label}: fewer than two options`);
  } else if (!Number.isInteger(item.answer) || item.answer < 0 || item.answer >= options.length) {
    bad(`${label}: answer index ${String(item.answer)} out of range for ${options.length} options`);
  } else {
    countPosition(item.answer);
    const normalised = options.map(normalise);

    if (new Set(normalised).size !== normalised.length) {
      bad(`${label}: duplicate options after normalisation`);
    }

    const answerText = normalised[item.answer] ?? "";
    if (answerText.length > 3 && normalise(item.prompt).includes(answerText)) {
      bad(`${label}: prompt leaks the answer`);
    }

    // The answer must not be conspicuously the longest option: a test-wise
    // candidate can pick the longest and score well without knowing anything,
    // which makes the retention signal meaningless.
    const lengths = normalised.map((o) => o.length);
    const longest = Math.max(...lengths);
    const secondLongest = [...lengths].sort((a, b) => a - b)[lengths.length - 2] ?? 0;
    if (lengths[item.answer] === longest && secondLongest * 1.6 < longest) {
      bad(`${label}: answer is conspicuously the longest option`);
    }
  }

  if (!String(item.explain ?? "").trim()) {
    bad(`${label}: empty explain — every item must say why`);
  }

  let warmup = false;
  if (!Number.isInteger(item.difficulty) || item.difficulty < 1 || item.difficulty > 5) {
    bad(`${label}: difficulty ${String(item.difficulty)} outside 1-5`);
  } else if (item.difficulty === 1) {
    warmup = true;
  }

  const visible = normalise([item.prompt, item.explain, ...options].join(" "));
  for (const phrase of BANNED_CLAIMS) {
    if (containsPhrase(visible, phrase)) {
      bad(`${label}: PROHIBITED CLAIM '${phrase}' in user-visible text`);
    }
  }
  if (isCompanion) {
    for (const word of COMPANION_FORBIDDEN) {
      if (containsPhrase(visible, word)) {
        bad(`${label}: companion-mode sensitivity screen rejects '${word}'`);
      }
    }
  }

  return { warmup };
}

export function validatePack(loaded: LoadedPack): Violation[] {
  const violations: Violation[] = [];
  const name = loaded.path.split(/[\\/]/).pop() ?? loaded.path;
  const bad = (message: string) => violations.push({ pack: name, message });
  const data = loaded.pack;

  if (typeof data !== "object" || data === null) {
    return [{ pack: name, message: "top level is not a mapping" }];
  }

  for (const field of REQUIRED_PACK_FIELDS) {
    if (!data[field]) bad(`missing required pack field '${field}'`);
  }

  const licence = String(data.license ?? "");

  // A private pack must never sit anywhere it could be published from.
  if (loaded.public && licence === "private") {
    bad("PRIVATE PACK IN A PUBLIC DIRECTORY — this must never be published");
  }
  if (!loaded.public && licence !== "private") {
    bad(`pack in packs-private/ is not marked private (license: ${licence})`);
  }

  const modes = data.modes ?? [];
  for (const mode of modes) {
    if (!VALID_MODES.has(mode)) bad(`unknown mode '${mode}'`);
  }

  const items = data.items ?? [];
  if (items.length === 0) bad("pack contains no items");

  const isCompanion = modes.includes("companion");
  const seen = new Map<string, number>();
  const positions = new Map<number, number>();
  let warmupCount = 0;

  items.forEach((item, i) => {
    const { warmup } = checkItem(item, i, isCompanion, bad, (p) =>
      positions.set(p, (positions.get(p) ?? 0) + 1),
    );
    if (warmup) warmupCount += 1;
    if (item?.id) seen.set(item.id, (seen.get(item.id) ?? 0) + 1);
  });

  for (const [id, count] of seen) {
    if (count > 1) bad(`duplicate item id '${id}' appears ${count} times`);
  }

  // Companion packs need a warmup pool: a first-time user must be able to
  // start on something easy rather than fail twice in a row.
  if (isCompanion && warmupCount < 3) {
    bad(`companion pack has only ${warmupCount} difficulty-1 warmup items (needs >= 3)`);
  }

  const total = [...positions.values()].reduce((a, b) => a + b, 0);
  if (total >= 8) {
    const [topPosition, topCount] = [...positions.entries()].sort((a, b) => b[1] - a[1])[0]!;
    if (topCount / total > 0.6) {
      bad(`positional bias: ${topCount}/${total} answers at index ${topPosition}`);
    }
  }

  for (const phrase of BANNED_CLAIMS) {
    if (containsPhrase(normalise(data.description ?? ""), phrase)) {
      bad(`PROHIBITED CLAIM '${phrase}' in pack description`);
    }
  }

  return violations;
}

export function validateAll(packs: LoadedPack[]): ValidationReport {
  const violations: Violation[] = [];
  const answerPositions: Record<number, number> = {};
  let itemCount = 0;

  for (const loaded of packs) {
    violations.push(...validatePack(loaded));
    for (const item of loaded.pack.items ?? []) {
      itemCount += 1;
      if (Number.isInteger(item?.answer)) {
        answerPositions[item.answer] = (answerPositions[item.answer] ?? 0) + 1;
      }
    }
  }

  // The per-pack gate cannot see this: 14 items over 4 options is too small a
  // sample for one pack to look skewed, while the corpus can still be
  // systematically lopsided.
  const total = Object.values(answerPositions).reduce((a, b) => a + b, 0);
  if (total > 0) {
    for (const share of Object.values(answerPositions).map((n) => n / total)) {
      if (share > 0.4 || share < 0.12) {
        violations.push({ pack: "<corpus>", message: "corpus-wide answer position is skewed" });
        break;
      }
    }
  }

  return { violations, packCount: packs.length, itemCount, answerPositions };
}
