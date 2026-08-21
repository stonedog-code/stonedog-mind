import { NextResponse } from "next/server";
import { FileStore } from "@stonedogcode/mind-core/node";
import type { ReviewEntry } from "@stonedogcode/mind-core";

/**
 * Record one answer.
 *
 * The whole persistence surface: append to the log and return. Scheduling state
 * is derived on read, never written here — recompute, never merge.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: Partial<ReviewEntry>;
  try {
    body = (await request.json()) as Partial<ReviewEntry>;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const { key, hash, correct } = body;
  if (typeof key !== "string" || typeof hash !== "string" || typeof correct !== "boolean") {
    return NextResponse.json({ error: "Missing key, hash or correct." }, { status: 400 });
  }

  // The server stamps the time. A client-supplied timestamp would let a clock
  // skew — or a stale tab — write history out of order, and the whole log is
  // ordered by this field.
  await new FileStore().append({ key, hash, correct, answeredAt: new Date().toISOString() });

  return NextResponse.json({ ok: true });
}
