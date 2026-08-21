"use client";

/**
 * Everything visual lives behind this client boundary.
 *
 * `@stonedogcode/style`'s components use React context and hooks
 * (`useFontSizeProfile`, `useStyleConfig`), so they are client components. A
 * server component that renders one gets "Attempted to call
 * useFontSizeProfile() from the server" — which reads like a bug in the design
 * system and is really a missing boundary.
 *
 * So the split is: the page does the I/O and hands over plain data; this
 * renders it. An embedding host uses the same shape, with a plan built from its
 * own store instead of from files.
 */

import { MindSession } from "@stonedogcode/mind-ui";
import type { LoadedPackSummary, SessionPlan } from "./types.ts";
import {
  StyledBox,
  StyledHStack,
  StyledHeading,
  StyledLink,
  StyledPage,
  StyledText,
  StyledVStack,
} from "@stonedogcode/style";

export interface MindAppProps {
  plan: SessionPlan;
  topics: LoadedPackSummary[];
  mode: "practice" | "companion";
  focus?: string | undefined;
}

export function MindApp({ plan, topics, mode, focus }: MindAppProps) {
  const isCompanion = mode === "companion";

  const href = (next: Record<string, string | undefined>) => {
    const merged: Record<string, string | undefined> = { mode, focus, ...next };
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    const s = sp.toString();
    return s ? `/?${s}` : "/";
  };

  return (
    <StyledPage>
      <StyledVStack
        gap="6"
        alignItems="stretch"
        style={{ maxWidth: "44rem", margin: "0 auto", padding: "1.5rem" }}
      >
        <StyledVStack gap="2" alignItems="flex-start">
          <StyledHeading as="h1">{isCompanion ? "Ready when you are" : "This morning"}</StyledHeading>
          <StyledText>
            {plan.items.length} questions · about {plan.estimatedMinutes} min ·{" "}
            {focus ? `focused on ${focus}` : `a mix of ${plan.topics.length} topics`}
          </StyledText>
        </StyledVStack>

        {/* Take the whole mix, or focus on one — both from the same screen. */}
        <StyledBox>
          <StyledHStack gap="3" style={{ flexWrap: "wrap" }}>
            <StyledLink href={href({ focus: undefined })}>
              All topics{focus ? "" : " ✓"}
            </StyledLink>
            {topics.map((t) => (
              <StyledLink key={t.id} href={href({ focus: t.id })}>
                {t.title}
                {focus === t.id ? " ✓" : ""}
              </StyledLink>
            ))}
          </StyledHStack>
        </StyledBox>

        <StyledBox>
          <StyledHStack gap="3">
            <StyledLink href={href({ mode: "practice", focus: undefined })}>
              Practice{mode === "practice" ? " ✓" : ""}
            </StyledLink>
            <StyledLink href={href({ mode: "companion", focus: undefined })}>
              Companion{isCompanion ? " ✓" : ""}
            </StyledLink>
          </StyledHStack>
        </StyledBox>

        <MindSession plan={plan} />

        {/*
          Disclaimer A — the senior-facing wording. Warm, short, no legal
          register: a paragraph of denial in front of someone's morning
          crossword is itself alarming. The full statement is in NOTICE.
        */}
        <StyledText>
          Just for fun. There&apos;s no score to beat and no right-or-wrong tally — stop whenever
          you like.
        </StyledText>
      </StyledVStack>
    </StyledPage>
  );
}
