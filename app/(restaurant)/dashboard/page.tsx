import { redirect } from "next/navigation";
import { resolveStaffContext } from "@/lib/auth/require-staff";
import { DashboardHomeClient } from "./dashboard-home-client";

export default async function RestaurantDashboard() {
  const ctx = await resolveStaffContext();
  if (!ctx) redirect("/login");

  return <DashboardHomeClient employeeName={ctx.employee.name} role={ctx.employee.role} />;
}
