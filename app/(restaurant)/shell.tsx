"use client";
import { SessionHeartbeat } from "@/components/session-heartbeat";
import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import type { Role } from "./nav-config";

export function DashboardShell({
  role,
  restaurantName,
  employeeName,
  employeeId,
  subStatus,
  modulePerms,
  shiftLabel,
  headerExtra,
  children,
}: {
  role: Role;
  restaurantName: string;
  employeeName: string;
  employeeId: string;
  subStatus: string;
  modulePerms: Record<string, boolean>;
  shiftLabel: string | null;
  /** extra content for the header (the desktop app puts its sync status here) */
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  // One boolean, same as the prototype's toggleSidebar(): false = the natural desktop
  // state (sidebar visible) which also happens to be the natural mobile state (drawer
  // closed); true flips both at once — collapses the sidebar on desktop, opens the
  // off-canvas drawer on mobile. See sidebar.tsx for how each breakpoint reads it.
  const [navToggled, setNavToggled] = useState(false);

  return (
    <div className="h-dvh overflow-hidden bg-canvas text-ink-strong flex">
      <SessionHeartbeat />
      <Sidebar
        role={role}
        restaurantName={restaurantName}
        modulePerms={modulePerms}
        shiftLabel={shiftLabel}
        navToggled={navToggled}
        onNavigate={() => setNavToggled(false)}
      />
      {/* Mobile-only backdrop so tapping outside the open drawer closes it */}
      {navToggled && (
        <button
          aria-label="Close sidebar"
          onClick={() => setNavToggled(false)}
          className="md:hidden fixed inset-0 z-40 bg-black/50"
        />
      )}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <Topbar
          employeeName={employeeName}
          employeeId={employeeId}
          role={role}
          subStatus={subStatus}
          extra={headerExtra}
          onToggleSidebar={() => setNavToggled((v) => !v)}
        />
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
