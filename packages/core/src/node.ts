/**
 * The Node-only surface: reading packs off disk.
 *
 * Kept out of the main entry point on purpose. A client component that reaches
 * for `loadPacks` gets a build error rather than a mysterious
 * "UnhandledSchemeError: node:fs" three layers down an import trace.
 */
export * from "./pack.ts";
export * from "./store-fs.ts";
