"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { DashboardShell } from "@/app/(restaurant)/shell";
import { DesktopCtxProvider, loadDesktopContext, type DesktopCtx } from "@/lib/desktop/context";
import { DesktopSyncBar } from "@/components/desktop-sync-bar";
import { DesktopOfflineNotice } from "@/components/desktop-offline-notice";
import { isOfflineOk, useOnline } from "@/lib/desktop/connectivity";

/** The desktop counterpart of the server-side shell setup in each web page.tsx: same sidebar +
 *  top bar (DashboardShell), but the signed-in cashier, permissions and shift come from the device
 *  (Rust), not a cookie, so it works offline. Used by every back-office page (via
 *  app/(restaurant)/layout.desktop.tsx) and by the POS, so all of them look identical to the web
 *  app. The sync status sits in the header. */
export function DesktopShell({ children }: { children: React.ReactNode }) {
  const [ctx, setCtx] = useState<DesktopCtx | null>(null);
  const pathname = usePathname() ?? "";
  const { online, recheck } = useOnline();

  useEffect(() => {
    loadDesktopContext()
      .then((c) => {
        if (!c) window.location.href = "/login/staff";
        else setCtx(c);
      })
      .catch(() => {
        window.location.href = "/login/staff";
      });
  }, []);

  if (!ctx) return null;

  // An online-only page with no connection: say so (with a way back to the POS) instead of letting
  // it load forever. The sidebar and top bar stay, so navigation still works.
  const showOfflineNotice = !online && !isOfflineOk(pathname);

  return (
    <DesktopCtxProvider value={ctx}>
      <DashboardShell
        role={ctx.role}
        restaurantName={ctx.restaurantName}
        employeeName={ctx.employeeName}
        employeeId={ctx.employeeId}
        subStatus={ctx.subStatus}
        modulePerms={ctx.modulePerms}
        shiftLabel={ctx.shiftLabel}
        headerExtra={<DesktopSyncBar />}
      >
        {showOfflineNotice ? <DesktopOfflineNotice onRetry={recheck} /> : children}
      </DashboardShell>
    </DesktopCtxProvider>
  );
}
