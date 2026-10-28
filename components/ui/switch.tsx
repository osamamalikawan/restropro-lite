"use client";

export function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-[22px] w-[38px] shrink-0 rounded-full border transition-colors ${
        checked ? "bg-basil-500/25 border-basil-500" : "bg-raised border-line"
      }`}
    >
      <span
        className={`absolute top-[2px] h-[16px] w-[16px] left-[2px] rounded-full transition-transform ${
          checked ? "translate-x-[18px] bg-basil-500" : "translate-x-[2px] bg-ink-faint"
        }`}
      />
    </button>
  );
}
