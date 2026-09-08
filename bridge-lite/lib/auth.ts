import { timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

export function requireInternalAuth(req: Request): { ok: true } | { ok: false; status: number; error: string } {
  const expected = process.env.HELIOS_INTERNAL_API_KEY;
  if (!expected) return { ok: false, status: 503, error: "HELIOS_INTERNAL_API_KEY is not configured." };

  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return { ok: false, status: 401, error: "Missing bearer token." };
  if (!safeEqual(token, expected)) return { ok: false, status: 401, error: "Invalid internal API key." };
  return { ok: true };
}

export function machineKieKey(): string | null {
  return process.env.HELIOS_ECOM_KIE_API_KEY ?? null;
}

export function publicBaseUrl(req?: Request): string | null {
  const explicit = process.env.CALLBACK_BASE_URL ?? process.env.BRIDGE_PUBLIC_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const systemUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (systemUrl) return `https://${systemUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;

  if (req) {
    try {
      return new URL(req.url).origin;
    } catch {
      return null;
    }
  }
  return null;
}
