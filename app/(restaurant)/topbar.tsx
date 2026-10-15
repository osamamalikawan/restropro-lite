"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { initials, colorForId } from "@/lib/avatar";
import { getPageMeta } from "./nav-config";
import NotificationBell from '@/components/notification-bell';

/**
 * Matches the prototype's #topbar 1:1: hamburger (sidebar toggle) + view title/subtitle on
 * the left, live clock + theme toggle + user chip on the right. The prototype swapped
 * viewTitle/viewSub via its JS router as the SPA changed "views" (switchView() in
 * router.js) — this app is real multi-page routing instead, so the title/subtitle are
 * derived from the current pathname (see nav-config.ts's VIEW_META) rather than passed in
 * by each page. There is deliberately no logout button here — that lives in the sidebar's
 * foot ("Clock out & switch user"), matching the prototype exactly.
 */
export function Topbar({
  employeeName,
  role,
  employeeId,
  subStatus,
  extra,
  onToggleSidebar,
}: {
  employeeName: string;
  role: string;
  employeeId: string;
  subStatus: string;
  extra?: React.ReactNode;
  onToggleSidebar: () => void;
}) {
  const pathname = usePathname();
  const { title, subtitle } = getPageMeta(pathname);
  const [time, setTime] = useState("");

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="h-16 border-b border-line bg-canvas flex items-center justify-between px-4 md:px-6 shrink-0 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onToggleSidebar}
          title="Toggle sidebar"
          className="w-9 h-9 rounded-lg border border-line bg-raised flex items-center justify-center text-ink-mid hover:text-ink-strong hover:border-chili-500 transition-colors shrink-0"
        >
          ☰
        </button>
        <div className="min-w-0">
          <div className="font-display font-semibold text-ink-strong text-[15px] truncate">{title}</div>
          {subStatus === "grace" ? (
            <div className="text-xs text-turmeric-400 truncate">Subscription in grace period — please renew</div>
          ) : (
            <div className="text-xs text-ink-faint truncate">{subtitle}</div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 md:gap-4 shrink-0">
        {extra}
        <span className="text-xs text-ink-faint font-mono hidden sm:inline">{time}</span>
        <ThemeToggle />
        <NotificationBell />
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center font-display font-bold text-[11px] text-white shrink-0"
            style={{ background: colorForId(employeeId) }}
          >
            {initials(employeeName)}
          </div>
          <div className="hidden sm:block text-right">
            <div className="text-sm font-medium text-ink-strong leading-tight">{employeeName}</div>
            <div className="text-xs text-ink-faint capitalize leading-tight">{role}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
