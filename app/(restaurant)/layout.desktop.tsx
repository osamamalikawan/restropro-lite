"use client";
import { DesktopShell } from "@/components/desktop-shell";

/** Desktop version of layout.tsx: same sidebar + top bar as the web app, with the signed-in
 *  cashier taken from the device instead of a server cookie (see components/desktop-shell.tsx). */
export default function DesktopDashboardLayout({ children }: { children: React.ReactNode }) {
  return <DesktopShell>{children}</DesktopShell>;
}
