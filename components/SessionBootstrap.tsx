"use client";

import { useEffect, useState } from "react";
import { ensureDeviceSession } from "@/lib/supabase/deviceSession";

export default function SessionBootstrap() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    ensureDeviceSession()
      .then(() => {
        if (active) setReady(true);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Unable to open HeliosGen.");
      });

    return () => {
      active = false;
    };
  }, [attempt]);

  if (ready) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#090a0c",
        color: "white",
        padding: "24px",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: "360px" }}>
        <div style={{ fontSize: "18px", fontWeight: 650 }}>HeliosGen</div>
        {error ? (
          <>
            <p style={{ margin: "12px 0 18px", color: "rgba(255,255,255,.6)", fontSize: "14px", lineHeight: 1.5 }}>
              {error}
            </p>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setAttempt((value) => value + 1);
              }}
              style={{
                border: 0,
                borderRadius: "10px",
                background: "#2DD4BF",
                color: "#07110f",
                cursor: "pointer",
                fontWeight: 700,
                padding: "10px 18px",
              }}
            >
              Réessayer
            </button>
          </>
        ) : (
          <p style={{ margin: "10px 0 0", color: "rgba(255,255,255,.5)", fontSize: "14px" }}>
            Ouverture de ton espace…
          </p>
        )}
      </div>
    </div>
  );
}
