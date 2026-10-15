"use client";
import { useEffect, useState } from "react";
import { PinPad } from "../pin-pad";
import { Spinner } from "@/components/ui/loading";

export function PinModal({
  employeeName,
  onSubmit,
  onClose,
  loading,
  error,
}: {
  employeeName: string;
  onSubmit: (pin: string) => void;
  onClose: () => void;
  loading: boolean;
  error: string;
}) {
  // Remounts the pad (and clears the dots) every time the modal reopens for a new employee
  // or after a failed attempt, matching the prototype's openPin()/pressPin() reset behaviour.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setAttempt((a) => a + 1);
  }, [error]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={(e) => e.target === e.currentTarget && !loading && onClose()}
    >
      <div className="w-full max-w-[340px] rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h3 className="font-display font-semibold text-ink-strong text-[15px]">
            Hi {employeeName.split(" ")[0]} — enter PIN
          </h3>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-ink-faint hover:text-ink-strong text-sm disabled:opacity-40 disabled:pointer-events-none"
          >
            ✕
          </button>
        </div>
        <div className="p-6">
          <PinPad key={attempt} onSubmit={onSubmit} loading={loading} />
          <div className="flex items-center justify-center gap-1.5 mt-3.5 min-h-[14px]">
            {loading ? (
              <>
                <Spinner size={12} className="text-chili-500" />
                <span className="text-[11px] text-ink-faint">Checking…</span>
              </>
            ) : (
              <p className="text-[11px] text-crimson-400">{error}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
