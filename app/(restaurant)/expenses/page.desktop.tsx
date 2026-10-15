'use client';
import { ExpensesClient } from "./expenses-client";
import { DesktopGuard } from "@/components/desktop-guard";

export default function ExpensesPage() {
  return (
    <DesktopGuard roles={["admin", "manager"]}>{(c) => (
      <ExpensesClient />
    )}</DesktopGuard>
  );
}
