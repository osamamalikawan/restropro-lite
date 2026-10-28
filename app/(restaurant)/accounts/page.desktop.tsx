'use client';
import { AccountsClient } from "./accounts-client";
import { DesktopGuard } from "@/components/desktop-guard";

export default function AccountsPage() {
  return (
    <DesktopGuard roles={["admin", "manager"]}>{(c) => (
      <AccountsClient />
    )}</DesktopGuard>
  );
}
