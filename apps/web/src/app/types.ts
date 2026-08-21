export type { RetentionReport, SessionPlan } from "@stonedogcode/mind-core";

/** Just enough of a pack for the topic picker — not the whole item list. */
export interface LoadedPackSummary {
  id: string;
  title: string;
}
