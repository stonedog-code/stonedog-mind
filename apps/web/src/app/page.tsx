import { redirect } from "next/navigation";
import { planSession, seedFor, type Mode } from "@stonedogcode/mind-core";
/*
  Reading packs off disk is the Node-only surface, imported from a separate
  entry point on purpose: a client component reaching for `loadPacks` gets a
  build error instead of dragging `node:fs` into the browser bundle. This page
  is a server component, so it may.
*/
import { loadPacks, packDirectories, packsForMode } from "@stonedogcode/mind-core/node";

import { MindApp } from "./mind-app.tsx";
import { EmptyState } from "./empty-state.tsx";

/**
 * Packs are read on the server, per request, so dropping a new `.yaml` into the
 * packs directory shows up on reload with no restart and no import step.
 */
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const mode: Mode = one(params["mode"]) === "companion" ? "companion" : "practice";
  const focus = one(params["focus"]);
  const rawBudget = Number(one(params["budget"]) ?? 20);
  const budget = Number.isFinite(rawBudget) && rawBudget > 0 ? Math.min(rawBudget, 100) : 20;

  const dirs = packDirectories();
  const available = packsForMode(loadPacks(dirs), mode);

  if (available.length === 0) return <EmptyState directories={dirs} mode={mode} />;
  if (focus && !available.some((p) => p.pack.pack === focus)) redirect("/");

  /*
    The server's date. A deployed instance would take the client's local date —
    a server-side "morning" is wrong for anyone who travels — but a single-user
    local app has no such ambiguity, and inventing the plumbing now would be
    speculative.
  */
  const date = new Date().toISOString().slice(0, 10);

  const plan = planSession({
    packs: available,
    mode,
    budget,
    date,
    seed: seedFor(date, `${mode}:${focus ?? "mix"}`),
    focus,
  });

  return (
    <MindApp
      plan={plan}
      mode={mode}
      focus={focus}
      topics={available.map((p) => ({ id: p.pack.pack, title: p.pack.title }))}
    />
  );
}
