"use client";
import { useEffect, useState } from "react";
import { Modal, Field, btnGhost, inputCls } from "@/components/ui/modal";

export type CancelStage = "active" | "preparing" | "completed";

/** Where an order is in the kitchen -> the stage it is cancelled at (Active = the "New" column). */
export const stageOf = (kitchen: string | null | undefined): CancelStage => (kitchen === "Completed" ? "completed" : kitchen === "Preparing" ? "preparing" : "active");
export const STAGE_LABEL: Record<CancelStage, string> = { active: "Active", preparing: "Preparing", completed: "Completed" };
/** "Order Cancelled at Active" - what the Sales page shows for a cancelled order. */
export const cancelledLabel = (stage: string | null | undefined) => (stage && stage in STAGE_LABEL ? `Order Cancelled at ${STAGE_LABEL[stage as CancelStage]}` : "Cancelled");

/** Confirms cancelling an order. A note explaining why is REQUIRED when the order was already Completed
 *  (optional earlier); the server enforces the same rule. */
export function CancelOrderDialog({
  open,
  orderLabel,
  stage,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  orderLabel: string;
  stage: CancelStage;
  busy: boolean;
  error: string;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (open) {
      setNote("");
      setTouched(false);
    }
  }, [open]);

  const required = stage === "completed"; // note required, and stock is not restored
  const missing = required && note.trim().length < 3;
  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      title={`Cancel order #${orderLabel}`}
      width="max-w-md"
      footer={
        <>
          <button onClick={onClose} disabled={busy} className={btnGhost}>
            Keep order
          </button>
          <button
            onClick={() => (missing ? setTouched(true) : onConfirm(note.trim()))}
            disabled={busy}
            className="rounded-lg bg-crimson-500 px-4 py-2 text-sm font-semibold text-white hover:bg-crimson-600 disabled:opacity-50"
          >
            {busy ? "Cancelling…" : "Cancel order"}
          </button>
        </>
      }
    >
      {error && <p className="rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-xs text-crimson-400">{error}</p>}
      <p className="text-sm text-ink-mid">
        This order is <span className="font-semibold text-ink-strong">{STAGE_LABEL[stage]}</span>.{" "}
        {required
          ? "Cancelling removes it from income, but its inventory is NOT restored - the food was already made."
          : "Cancelling restores its inventory and removes it from income."}{" "}
        It will show as <span className="font-semibold text-ink-strong">&quot;{cancelledLabel(stage)}&quot;</span> in Sales.
      </p>
      <Field label={required ? "Why is this completed order being cancelled? (required)" : "Reason (optional)"}>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={300}
          autoFocus={required}
          placeholder={required ? "e.g. customer returned the food, wrong order delivered…" : "e.g. customer changed their mind"}
          className={`${inputCls} resize-none ${touched && missing ? "border-crimson-500" : ""}`}
        />
        {touched && missing && <p className="mt-1 text-xs font-semibold text-crimson-400">A note is required to cancel a completed order.</p>}
      </Field>
    </Modal>
  );
}
