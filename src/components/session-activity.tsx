"use client";

import { useEffect, useState } from "react";

export function SessionActivity({ remember, sessionId }: { remember: boolean; sessionId: string }) {
  const [warning, setWarning] = useState(false);
  useEffect(() => {
    if (remember) return;
    let lastActivity = Date.now();
    let lastHeartbeat = 0;
    let inFlight = false;
    const storageKey = `sias-ts-activity-${sessionId}`;
    const headers = { "X-SIAS-Session": sessionId };
    const activity = () => {
      if (Date.now() - lastActivity < 1000) return;
      lastActivity = Date.now();
      setWarning(false);
      try { localStorage.setItem(storageKey, String(lastActivity)); } catch { /* Storage is optional. */ }
    };
    const sync = (event: StorageEvent) => {
      if (event.key === storageKey && event.newValue) {
        const value = Number(event.newValue);
        if (Number.isFinite(value) && value <= Date.now()) lastActivity = Math.max(lastActivity, value);
      }
    };
    const events = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart"];
    events.forEach((event) => window.addEventListener(event, activity, { passive: true }));
    window.addEventListener("storage", sync);
    let ending = false;
    const interval = window.setInterval(async () => {
      const now = Date.now();
      const idle = now - lastActivity;
      setWarning(idle >= 240_000);
      if (idle >= 300_000) {
        if (ending) return;
        ending = true;
        try {
          const response = await fetch("/api/session", { method: "DELETE", credentials: "same-origin", headers });
          if (response.status === 409) {
            window.location.replace("/");
            return;
          }
        } catch {
          // Server-side expiry still applies when the network is unavailable.
        }
        window.location.replace("/login?session=expired");
        return;
      }
      if (idle > 60_000 || now - lastHeartbeat < 60_000 || inFlight) return;
      inFlight = true;
      lastHeartbeat = now;
      try {
        const response = await fetch("/api/session", { method: "POST", credentials: "same-origin", headers });
        if (response.status === 409) window.location.replace("/");
        if (response.status === 401) window.location.replace("/login?session=expired");
      } catch { /* Server expiry remains authoritative if the network is unavailable. */ }
      finally { inFlight = false; }
    }, 10_000);
    return () => {
      clearInterval(interval);
      events.forEach((event) => window.removeEventListener(event, activity));
      window.removeEventListener("storage", sync);
    };
  }, [remember, sessionId]);
  return warning ? <p role="status" className="border-b border-amber-300 bg-amber-50 px-6 py-3 text-sm text-amber-950">Sesi akan berakhir setelah 5 menit tanpa aktivitas. Berinteraksilah dengan halaman untuk melanjutkan.</p> : null;
}
