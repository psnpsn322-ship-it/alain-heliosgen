"use client";

import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

const DEVICE_ID_KEY = "heliosgen-device-id";

let inFlightSession: Promise<Session> | null = null;
let memoryDeviceId: string | null = null;

function createDeviceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function getDeviceId(): string {
  if (memoryDeviceId) return memoryDeviceId;

  try {
    const saved = window.localStorage.getItem(DEVICE_ID_KEY);
    if (saved) {
      memoryDeviceId = saved;
      return saved;
    }

    const created = createDeviceId();
    window.localStorage.setItem(DEVICE_ID_KEY, created);
    memoryDeviceId = created;
    return created;
  } catch {
    memoryDeviceId = createDeviceId();
    return memoryDeviceId;
  }
}

async function createDeviceSession(): Promise<Session> {
  const supabase = createClient();
  const { data: existing, error: existingError } = await supabase.auth.getSession();

  if (existingError) throw existingError;
  if (existing.session) return existing.session;

  const response = await fetch("/api/auth/device-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId: getDeviceId() }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | { tokenHash?: string; error?: string }
    | null;

  if (!response.ok || !payload?.tokenHash) {
    throw new Error(payload?.error || "Unable to open the local HeliosGen session.");
  }

  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: payload.tokenHash,
    type: "magiclink",
  });

  if (error) throw error;
  if (!data.session) throw new Error("Supabase did not return a session.");
  return data.session;
}

export function ensureDeviceSession(): Promise<Session> {
  if (!inFlightSession) {
    inFlightSession = createDeviceSession().catch((error) => {
      inFlightSession = null;
      throw error;
    });
  }

  return inFlightSession;
}
