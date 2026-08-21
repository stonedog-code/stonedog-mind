"use client";

import { useCallback } from "react";
import { MindSession } from "@stonedogcode/mind-ui";
import type { Grade, SessionPlan } from "@stonedogcode/mind-core";

/**
 * Persistence lives here, not in `MindSession`.
 *
 * The component reports what happened; the shell decides where it goes. That is
 * what lets an embedding host swap a file for its own database without touching
 * the quiz screens.
 */
export function SessionClient({ plan }: { plan: SessionPlan }) {
  const onAnswer = useCallback(
    (key: string, result: Grade) => {
      const item = plan.items.find((i) => i.key.key === key);
      if (!item) return;

      // Fire-and-forget, deliberately. Blocking the next question on a disk
      // write would make the quiz feel laggy for no gain, and a lost answer
      // costs one review interval, not correctness — the log is the record and
      // it is rebuilt from whatever is in it.
      void fetch("/api/answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, hash: item.key.hash, correct: result.correct }),
      }).catch(() => {
        /* offline: this answer is not recorded. Nothing else breaks. */
      });
    },
    [plan.items],
  );

  return <MindSession plan={plan} onAnswer={onAnswer} />;
}
