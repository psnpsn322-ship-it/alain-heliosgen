import { timingSafeEqual } from "node:crypto";

export interface InternalAuthOk {
  ok: true;
}
export interface InternalAuthFail {
  ok: false;
  status: number;
  error: string;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

export function checkInternalAuth(req: Request): InternalAuthOk | InternalAuthFail {
  const expected = process.env.HELIOS_INTERNAL_API_KEY;
  if (!expected) {
    return { ok: false, status: 503, error: "Internal API not configured (HELIOS_INTERNAL_API_KEY missing)." };
  }
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    return { ok: false, status: 401, error: "Missing bearer token." };
  }
  if (!safeEqual(token, expected)) {
    return { ok: false, status: 401, error: "Invalid internal API key." };
  }
  return { ok: true };
}

export function internalKieKey(): string | null {
  return process.env.HELIOS_ECOM_KIE_API_KEY ?? process.env.KIE_API_KEY ?? null;
}
