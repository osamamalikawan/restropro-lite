"use client";
import { useEffect } from "react";
import { isTauri } from "@/lib/platform";

const BEAT_MS = 45_000; // idle sign-out is never shorter than 2 min, so 45 s is safe

/** Tells the server this staff session is still open (every 45 s while the app is on screen), so a closed tab or a
 *  switched-off device is signed out automatically and - with "one device per user" on - frees the user to sign in
 *  somewhere else. If the server says the session is over (signed in on another device, idle too long), the page
 *  goes to the login screen. Renders nothing. The desktop app keeps its own session and is skipped. */
export function SessionHeartbeat() {
  useEffect(() => {
    if (isTauri()) return;
    let misses = 0;
    let gone = false;

    async function beat() {
      if (gone) return;
      try {
        const res = await fetch("/api/staff/heartbeat", { method: "POST", cache: "no-store" });
        if (res.status === 401) {
          // two in a row, so one unlucky database hiccup doesn't throw a cashier out mid-order
          misses += 1;
          if (misses >= 2) {
            gone = true;
            window.location.href = "/login";
          }
        } else {
          misses = 0;
        }
      } catch {
        /* offline: the next beat tries again */
      }
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };
    // a tab/window being closed (not a reload - the new page pings straight away and keeps the session)
    const onHide = (e: PageTransitionEvent) => {
      if (!e.persisted && !gone) navigator.sendBeacon("/api/staff/heartbeat?closing=1", new Blob([], { type: "text/plain" }));
    };

    beat();
    const timer = setInterval(beat, BEAT_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", onHide);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);
  return null;
}
