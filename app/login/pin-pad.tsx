"use client";
import { useState } from "react";

/** Dot indicators showing how many digits have been entered, plus a 4x3 number grid
 *  (1-9, Clear, 0, Go) — matching the original HTML prototype's PIN pad. */
export function PinPad({
  onSubmit,
  loading,
}: {
  onSubmit: (pin: string) => void;
  loading: boolean;
}) {
  const [pin, setPin] = useState("");

  function press(key: string) {
    if (key === "clr") {
      setPin("");
      return;
    }
    if (key === "ok") {
      if (pin.length === 4) onSubmit(pin);
      return;
    }
    if (pin.length < 4) {
      const next = pin + key;
      setPin(next);
      if (next.length === 4) {
        setTimeout(() => onSubmit(next), 150);
      }
    }
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clr", "0", "ok"];

  return (
    <div>
      <div className="flex justify-center gap-2.5 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`w-3.5 h-3.5 rounded-full border-2 transition-colors ${
              i < pin.length ? "bg-chili-500 border-chili-500" : "border-line"
            }`}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2.5 max-w-[240px] mx-auto">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            disabled={loading}
            onClick={() => press(k)}
            className={`aspect-square rounded-full flex items-center justify-center font-display text-lg font-semibold border border-line transition-colors disabled:opacity-40 ${
              k === "clr" || k === "ok"
                ? "text-ink-faint text-xs font-body bg-raised hover:bg-hover"
                : "bg-raised hover:bg-hover text-ink-strong"
            }`}
          >
            {k === "clr" ? "Clear" : k === "ok" ? "Go" : k}
          </button>
        ))}
      </div>
    </div>
  );
}
