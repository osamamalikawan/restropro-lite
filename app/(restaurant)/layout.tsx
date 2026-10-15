import { redirect } from "next/navigation";
import { resolveStaffContext } from "@/lib/auth/require-staff";
import { fmtTime } from "@/lib/format";
import { DashboardShell } from "./shell";

/**
 * Wraps every /dashboard/* page with the persistent sidebar + topbar that were missing —
 * each individual page previously rendered as a bare standalone screen. This is the ONE place
 * the "is there a valid session, is the restaurant active, is the subscription usable" check
 * happens for the dashboard section; individual pages still do their own additional role
 * checks (e.g. Settings requires admin) on top of this.
 *
 * /pos is intentionally OUTSIDE this layout (it's a sibling route, app/pos/page.tsx) — a
 * cashier terminal benefits from a distraction-free full-screen POS rather than the same
 * chrome as the back-office pages.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await resolveStaffContext();
  if (!ctx) redirect("/login");

  return (
    <DashboardShell
      role={ctx.employee.role}
      restaurantName={ctx.restaurant.name}
      employeeName={ctx.employee.name}
      employeeId={ctx.employee.id}
      subStatus={ctx.subStatus}
      modulePerms={ctx.modulePerms}
      shiftLabel={ctx.shift ? `${fmtTime(ctx.shift.start)} – ${fmtTime(ctx.shift.end)}` : null}
    >
      {children}
    </DashboardShell>
  );
}
