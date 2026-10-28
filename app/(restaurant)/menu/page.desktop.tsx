'use client';
import { MenuClient } from "./menu-client";
import { DesktopGuard } from "@/components/desktop-guard";

export default function MenuPage() {
  return (
    <DesktopGuard roles={["admin", "manager"]}>{(c) => (
      <MenuClient />
    )}</DesktopGuard>
  );
}
