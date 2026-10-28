"use client";
import { installDesktopFetch } from "@/lib/desktop/fetch-bridge";

// Installed at module load (before any screen's effects run) and again on render, in case the
// module was evaluated during a static-export pass with no window. A no-op in the browser.
installDesktopFetch();

export function DesktopBridge() {
  installDesktopFetch();
  return null;
}
