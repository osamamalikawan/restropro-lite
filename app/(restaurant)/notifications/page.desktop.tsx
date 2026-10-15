'use client';
import NotificationsClient from "./notifications-client";
import { DesktopGuard } from "@/components/desktop-guard";

export default function NotificationsPage() {
  return (
    <DesktopGuard>{() => (
      <main className="p-6">
        <header className="mb-6">
          <h1 className="font-display text-2xl text-ink-strong">Notifications</h1>
          <p className="mt-1 text-sm text-ink-mid">Announcements sent to this restaurant by Restro Pro.</p>
        </header>
        <NotificationsClient />
      </main>
    )}</DesktopGuard>
  );
}
