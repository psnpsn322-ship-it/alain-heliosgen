import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * KIE callback receiver for Bridge Lite.
 *
 * Bridge Lite is intentionally stateless: Ecom OS polls /api/internal/jobs/:id,
 * and that endpoint asks KIE for the authoritative task status. We still expose
 * a valid callback URL because KIE's task creation contract expects one.
 */
export async function POST(req: Request) {
  try {
    await req.json();
  } catch {
    // Acknowledge even if the provider sends an empty/non-JSON callback body.
  }
  return NextResponse.json({ ok: true });
}
