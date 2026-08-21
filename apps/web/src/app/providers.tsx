"use client";

import type { ReactNode } from "react";
import { StonedogStyleProvider } from "@stonedogcode/style";

/**
 * The design-system seam.
 *
 * A host feeds this from wherever it keeps user preferences. The standalone app
 * has no such store yet, so it takes the defaults; the important thing is that
 * the seam exists, because it is what lets one component tree look right in two
 * different products.
 */
export function Providers({ children }: { children: ReactNode }) {
  return <StonedogStyleProvider>{children}</StonedogStyleProvider>;
}
