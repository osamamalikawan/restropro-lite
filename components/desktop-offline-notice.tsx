"use client";
import Link from "next/link";
import { WifiOff } from "lucide-react";

/** Shown in place of a page that needs the internet while the computer is offline, so the page
 *  doesn't spin forever. The way out is always the POS, which works without a connection. */
export function DesktopOfflineNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-lg">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-turmeric-500/15 text-turmeric-400">
          <WifiOff size={26} />
        </div>
        <h1 className="font-display text-xl font-semibold text-ink-strong">You&apos;re offline</h1>
        <p className="mt-2 text-sm text-ink-mid">
          This page needs an internet connection. The POS, Ticket Rail, Sales and Unpaid Orders keep working, and
          everything you ring up is saved on this computer and uploaded automatically when you&apos;re back online.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href="/pos"
            className="rounded-lg bg-chili-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-chili-600 transition-colors"
          >
            Go to POS
          </Link>
          <button
            onClick={onRetry}
            className="rounded-lg border border-line bg-raised px-4 py-2.5 text-sm font-medium text-ink-mid hover:text-ink-strong"
          >
            Try again
          </button>
        </div>
      </div>
    </main>
  );
}
