"use client";

/**
 * The quiz session, as a component.
 *
 * This is the piece every consumer renders — the standalone app, and any host
 * that embeds the quiz. Writing it twice would produce two things to keep in
 * sync, and they would drift: the standalone app would get a fix the embedded
 * one did not.
 *
 * Everything visual comes from `@stonedogcode/style`. Nothing here defines a
 * colour, a spacing step, or a type size of its own — the host's theme decides,
 * which is what lets one component look right in two products.
 */

import { useCallback, useMemo, useState } from "react";
import {
  StyledBox,
  StyledButton,
  StyledHStack,
  StyledHeading,
  StyledText,
  StyledVStack,
} from "@stonedogcode/style";
import { grade, type Grade, type Mode, type SessionPlan } from "@stonedogcode/mind-core";

export interface MindSessionProps {
  plan: SessionPlan;
  /**
   * Practice shows progress and a summary; companion shows neither.
   * Defaults to the plan's own mode.
   */
  mode?: Mode;
  /** Called once per answer, so a host can persist review state. */
  onAnswer?: (key: string, result: Grade) => void;
  /** Called when the session ends, however it ends. */
  onFinish?: (answered: number, correct: number) => void;
}

export function MindSession({ plan, mode, onAnswer, onFinish }: MindSessionProps) {
  const effectiveMode = mode ?? plan.mode;
  const isCompanion = effectiveMode === "companion";

  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<Grade | null>(null);
  const [answered, setAnswered] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [done, setDone] = useState(false);

  const current = plan.items[index];

  const choose = useCallback(
    (choice: number) => {
      if (!current || result) return;
      const outcome = grade(current.item, choice);
      setResult(outcome);
      setAnswered((n) => n + 1);
      if (outcome.correct) setCorrect((n) => n + 1);
      onAnswer?.(current.key.key, outcome);
    },
    [current, result, onAnswer],
  );

  const advance = useCallback(() => {
    setResult(null);
    if (index + 1 >= plan.items.length) {
      setDone(true);
      onFinish?.(answered, correct);
    } else {
      setIndex((i) => i + 1);
    }
  }, [index, plan.items.length, answered, correct, onFinish]);

  const stop = useCallback(() => {
    setDone(true);
    onFinish?.(answered, correct);
  }, [answered, correct, onFinish]);

  const summary = useMemo(() => {
    if (isCompanion) {
      // No score, ever. A senior who is told they got 4 out of 10 has been
      // handed a daily reminder of decline — the opposite of the point.
      return "That was lovely. See you tomorrow.";
    }
    return `${correct} of ${answered} correct.`;
  }, [isCompanion, correct, answered]);

  if (done || !current) {
    return (
      <StyledVStack gap="4" alignItems="flex-start">
        <StyledHeading as="h2">{isCompanion ? "Thank you" : "Session complete"}</StyledHeading>
        <StyledText>{summary}</StyledText>
        {!isCompanion && (
          <StyledText>
            Stopping early is not a failure — a short session still counts.
          </StyledText>
        )}
      </StyledVStack>
    );
  }

  return (
    <StyledVStack gap="5" alignItems="stretch" width="100%">
      {/*
        Practice shows position; companion does not. A progress bar racing
        toward an end is pressure, and pressure is the thing companion mode is
        built to remove.
      */}
      {!isCompanion && (
        <StyledText>
          {index + 1} of {plan.items.length} · about {plan.estimatedMinutes} min · stop any time
        </StyledText>
      )}

      <StyledHeading as="h2">{current.item.prompt}</StyledHeading>

      <StyledVStack gap="3" alignItems="stretch" role="group" aria-label="Answers">
        {current.item.options.map((option, i) => {
          const chosen = result?.chosen === i;
          const isAnswer = result !== null && i === current.item.answer;
          return (
            <StyledButton
              key={option}
              onClick={() => choose(i)}
              disabled={result !== null}
              aria-pressed={chosen}
              variant={isAnswer ? "selected" : "outline"}
              /*
                Size metrics go in inline `style`, not Panda props.
                Panda only extracts LITERAL values at build time, so a computed
                or prop-passed size emits no rule while the class still lands in
                the DOM. Inline style also makes this immune to a consumer whose
                Panda `include` glob does not cover this package.
              */
              style={{
                minHeight: "48px",
                textAlign: "left",
                justifyContent: "flex-start",
                whiteSpace: "normal",
              }}
            >
              {option}
            </StyledButton>
          );
        })}
      </StyledVStack>

      {result && (
        <StyledBox padding="4" borderRadius="md" style={{ borderWidth: 1, borderStyle: "solid" }}>
          <StyledVStack gap="2" alignItems="flex-start">
            {/*
              Companion mode never says "wrong". It gives the answer and
              something interesting about it, and moves on.
            */}
            <StyledText>
              {isCompanion
                ? current.item.options[current.item.answer]
                : result.correct
                  ? "Correct"
                  : "Not quite"}
            </StyledText>
            <StyledText>{result.explain}</StyledText>
          </StyledVStack>
        </StyledBox>
      )}

      <StyledHStack gap="3">
        {result && (
          <StyledButton onClick={advance} variant="solid" style={{ minHeight: "48px" }}>
            {index + 1 >= plan.items.length ? "Finish" : "Next"}
          </StyledButton>
        )}
        <StyledButton onClick={stop} variant="ghost" style={{ minHeight: "48px" }}>
          {isCompanion ? "That's enough for today" : "Stop here"}
        </StyledButton>
      </StyledHStack>
    </StyledVStack>
  );
}

export default MindSession;
