'use client';
import { DashboardHomeClient } from "./dashboard-home-client";
import { DesktopGuard } from "@/components/desktop-guard";

export default function RestaurantDashboard() {
  return (
    <DesktopGuard>{(c) => <DashboardHomeClient employeeName={c.employeeName} role={c.role} />}</DesktopGuard>
  );
}
