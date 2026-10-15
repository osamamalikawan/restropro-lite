'use client';
import { PrinterSettings } from "./printer-settings-client";
import { DesktopGuard } from "@/components/desktop-guard";

export default function PrinterSettingsPage() {
  return (
    <DesktopGuard module="settings">{() => (
      <main className="min-h-screen bg-canvas text-ink-strong p-6 md:p-8">
        <h1 className="font-display text-2xl font-bold mb-1">Printer settings</h1>
        <p className="text-sm text-ink-mid mb-6">Saved per computer, since a USB or network printer only makes sense on the PC that reaches it.</p>
        <PrinterSettings />
      </main>
    )}</DesktopGuard>
  );
}
