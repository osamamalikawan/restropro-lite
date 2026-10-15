'use client';
import { SalesClient } from "./sales-client";
import { DesktopGuard } from "@/components/desktop-guard";

export default function SalesPage() {
  return (
    <DesktopGuard module="sales">{(c) => (
      <SalesClient canCancel={c.isAdminOrManager} />
    )}</DesktopGuard>
  );
}
