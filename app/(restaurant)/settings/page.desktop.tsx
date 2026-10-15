'use client';
import { SettingsClient } from "./settings-client";
import { DesktopGuard } from "@/components/desktop-guard";

export default function SettingsPage() {
  return <DesktopGuard module="settings">{() => <SettingsClient />}</DesktopGuard>;
}
