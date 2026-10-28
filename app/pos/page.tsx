import { redirect } from "next/navigation";
import { resolveStaffContext } from "@/lib/auth/require-staff";
import { fmtTime } from "@/lib/format";
import { DashboardShell } from "@/app/(restaurant)/shell";
import { PosClient } from "./pos-client";

// The POS now sits inside the same sidebar + topbar shell as every other page. The offline
// desktop build swaps this file for page.desktop.tsx (no server session there), which renders
// PosClient standalone — so PosClient works both ways via its `withShell` prop.
export default async function PosPage() {
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
      <PosClient
        withShell
        restaurantId={ctx.restaurant.id}
        restaurantName={ctx.restaurant.name}
        cashierName={ctx.employee.name}
      />
    </DashboardShell>
  );
}
