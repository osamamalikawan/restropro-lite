"use client";
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** Is the cloud reachable? Asks the desktop app (a quick connection test, not the browser's
 *  unreliable `navigator.onLine`, which stays "true" on a LAN with no internet). Starts as
 *  "online" so a screen never flashes an offline message while the first check runs. */
export function useOnline(pollMs = 8000) {
  const [online, setOnline] = useState(true);

  const recheck = useCallback(async () => {
    try {
      setOnline(await invoke<boolean>("check_online"));
    } catch {
      /* keep the last known state */
    }
  }, []);

  useEffect(() => {
    recheck();
    const timer = setInterval(recheck, pollMs);
    const goOffline = () => setOnline(false); // the OS says the network is down — believe it at once
    window.addEventListener("online", recheck);
    window.addEventListener("offline", goOffline);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", recheck);
      window.removeEventListener("offline", goOffline);
    };
  }, [recheck, pollMs]);

  return { online, recheck };
}

/** Screens that keep working with no internet (they read this computer's saved data). Every
 *  other page shows the "You're offline" notice instead of loading forever. */
export const OFFLINE_OK_PATHS = ["/pos", "/sales", "/settings"];

export function isOfflineOk(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  return OFFLINE_OK_PATHS.some((ok) => p === ok || p.startsWith(ok + "/"));
}
