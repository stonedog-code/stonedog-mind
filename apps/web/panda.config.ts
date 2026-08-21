import { defineConfig } from "@pandacss/dev";
import { stonedogStylePreset } from "@stonedogcode/style/preset";

export default defineConfig({
  preflight: true,

  /**
   * The base presets are listed EXPLICITLY, and that is load-bearing.
   *
   * Supplying a `presets` array REPLACES Panda's defaults rather than adding to
   * them. Omit these two and the design system's recipes lose every token they
   * lean on — the grey scale, the radii, the spacing steps — and Panda drops
   * those declarations SILENTLY. No build error, no console warning, just wrong
   * pixels.
   */
  presets: [
    "@pandacss/preset-base",
    "@pandacss/preset-panda",
    stonedogStylePreset({ cssVarPrefix: "mind" }),
  ],

  /**
   * Panda extracts styles by statically parsing SOURCE at the consumer's build.
   * A package Panda never parses contributes no CSS, and its components then
   * render with class names that have no rules behind them — no build error, no
   * warning, just an unstyled page that looks like a CSS bug somewhere else.
   *
   * BOTH node_modules locations for each package, and that is not
   * belt-and-braces. npm workspaces HOISTS to the repo root when it can, so
   * `./node_modules/...` — resolved from here, where panda runs — may match
   * nothing; whether it hoists depends on version conflicts across the
   * workspace, so NEITHER location is guaranteed and a single path is a coin
   * flip. A dead glob costs nothing. `panda.test.ts` asserts at least one of
   * each pair resolves to real files, so a glob matching nothing fails a test
   * instead of shipping.
   */
  include: [
    "./src/**/*.{ts,tsx}",
    "./node_modules/@stonedogcode/style/src/**/*.tsx",
    "../../node_modules/@stonedogcode/style/src/**/*.tsx",
    "./node_modules/@stonedogcode/mind-ui/src/**/*.tsx",
    "../../node_modules/@stonedogcode/mind-ui/src/**/*.tsx",
    "../../packages/ui/src/**/*.tsx",
  ],
  exclude: [
    "./node_modules/@stonedogcode/style/src/**/__tests__/**/*",
    "../../node_modules/@stonedogcode/style/src/**/__tests__/**/*",
  ],

  outdir: "styled-system",
  jsxFramework: "react",
});
