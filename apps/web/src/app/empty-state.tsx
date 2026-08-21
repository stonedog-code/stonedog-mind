"use client";

import { StyledHeading, StyledPage, StyledText, StyledVStack } from "@stonedogcode/style";

/**
 * No packs. A calm empty state that says what to do — never an error, and never
 * a stack trace.
 */
export function EmptyState({ directories, mode }: { directories: string[]; mode: string }) {
  return (
    <StyledPage>
      <StyledVStack gap="4" alignItems="flex-start" style={{ padding: "1.5rem" }}>
        <StyledHeading as="h1">Nothing to ask you yet</StyledHeading>
        <StyledText>
          No packs were found for {mode} mode. Drop a .yaml pack into one of these directories and
          reload — there is no import step.
        </StyledText>
        <StyledVStack gap="1" alignItems="flex-start">
          {directories.map((d) => (
            <StyledText key={d}>{d}</StyledText>
          ))}
        </StyledVStack>
      </StyledVStack>
    </StyledPage>
  );
}
