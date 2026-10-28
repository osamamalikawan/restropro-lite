"use client";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PageLoader, Spinner } from "@/components/ui/loading";
import { Switch } from "@/components/ui/switch";
import { ReorderableList } from "@/components/ui/reorderable-list";
import { isTauri } from "@/lib/posData";
import { PrinterSettings } from "../printer-settings/printer-settings-client";

type PaymentMethod = { id: string; name: string };

const inputCls = "w-full rounded-lg bg-raised border border-line px-3 py-2 text-sm text-ink-strong focus:outline-none focus:ring-1 focus:ring-chili-500";

/** Desktop app: pull the freshly saved settings / lists onto this computer straight away
 *  (the POS reads its saved copy, which would otherwise only update at the next sync). */
function refreshDeviceData() {
  if (isTauri()) invoke("sync_now", { retryRejected: false }).catch(() => {});
}

function Panel({ title, subtitle, footer, loading = false, children }: { title: string; subtitle: string; footer?: React.ReactNode; loading?: boolean; children: React.ReactNode }) {
  return (
    <div className="relative flex h-full flex-col rounded-xl border border-line bg-surface p-6">
      <div className="mb-4">
        <h3 className="font-display text-[15px] font-semibold text-ink-strong">{title}</h3>
        <div className="mt-0.5 text-xs text-ink-faint">{subtitle}</div>
      </div>
      <div className="flex-1">{children}</div>
      {footer && <div className="mt-4">{footer}</div>}
      {loading && <div className="absolute inset-0 grid place-items-center rounded-xl bg-surface/60"><Spinner size={20} /></div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3.5 block">
      <span className="mb-1 block text-xs font-medium text-ink-mid">{label}</span>
      {children}
    </label>
  );
}

function SaveButton({ onClick, children, loading = false }: { onClick: () => void; children: React.ReactNode; loading?: boolean }) {
  return (
    <button onClick={onClick} disabled={loading} className="inline-flex items-center gap-1.5 rounded-md bg-chili-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-chili-600 disabled:opacity-60">
      {loading && <Spinner size={14} />}
      {children}
    </button>
  );
}

/** Lite Settings: restaurant profile (no service charge), the Urdu names switch, payment methods,
 *  and this computer's printers. */
export function SettingsClient() {
  const [loading, setLoading] = useState(true);
  const [restName, setRestName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [urdu, setUrdu] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [newMethod, setNewMethod] = useState("");
  const [methodError, setMethodError] = useState("");

  async function loadMethods() {
    const res = await fetch("/api/payment-methods");
    const data = await res.json().catch(() => ({}));
    if (res.ok) setMethods(data.methods ?? []);
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/settings");
        const data = await res.json();
        if (res.ok) {
          setRestName(data.restaurant?.name ?? "");
          setAddress(data.restaurant?.address ?? "");
          setPhone(data.restaurant?.phone ?? "");
          setUrdu(data.settings?.urdu_enabled === true);
        } else setMsg({ text: data.error || "Could not load settings", error: true });
        await loadMethods();
      } catch {
        setMsg({ text: "Settings need an internet connection. The printer section below still works.", error: true });
      }
      setLoading(false);
    })();
  }, []);

  async function save(section: string, body: Record<string, unknown>, okMessage: string) {
    setMsg(null);
    setSaving(section);
    const res = await fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setSaving(null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) {
      setMsg({ text: data.error || "Could not save", error: true });
      return false;
    }
    setMsg({ text: okMessage });
    setTimeout(() => setMsg(null), 2500);
    refreshDeviceData();
    return true;
  }

  async function toggleUrdu(v: boolean) {
    setUrdu(v);
    const ok = await save("urdu", { urduEnabled: v }, v ? "Urdu names are on" : "Urdu names are off");
    if (!ok) setUrdu(!v);
  }

  async function addMethod() {
    const name = newMethod.trim();
    if (!name) return setMethodError("Enter a payment method name");
    setMethodError("");
    const res = await fetch("/api/payment-methods", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "insert", row: { name } }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setMethodError(data.error || "Could not add it");
    setNewMethod("");
    loadMethods();
    refreshDeviceData();
  }

  async function removeMethod(m: PaymentMethod) {
    setMethodError("");
    const res = await fetch("/api/payment-methods", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "delete", row: { id: m.id } }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setMethodError(data.error || "Could not remove it");
    setMethods((prev) => prev.filter((x) => x.id !== m.id));
    refreshDeviceData();
  }

  /** Show the new order at once, save it, and undo (with a message) if the server refuses. */
  async function reorderMethods(next: PaymentMethod[]) {
    const current = methods;
    setMethods(next);
    const res = await fetch("/api/reorder", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "payment_methods", ids: next.map((r) => r.id) }) }).catch(() => null);
    if (!res || !res.ok) {
      setMethods(current);
      setMethodError(res ? ((await res.json().catch(() => ({}))).error ?? "Could not save the new order") : "Could not reach the server.");
      return;
    }
    refreshDeviceData();
  }

  if (loading) {
    return (
      <main className="p-6 md:p-8">
        <PageLoader label="Loading settings…" />
      </main>
    );
  }

  return (
    <main className="p-6 md:p-8">
      {msg && <p className={`mb-4 text-sm ${msg.error ? "text-crimson-400" : "text-basil-400"}`}>{msg.text}</p>}

      <div className="grid items-stretch gap-6 md:grid-cols-2">
        <Panel
          title="Restaurant profile"
          subtitle="Shown on receipts and the staff login screen"
          loading={saving === "profile"}
          footer={<SaveButton loading={saving === "profile"} onClick={() => save("profile", { restaurantName: restName, address, phone }, "Profile saved")}>Save profile</SaveButton>}
        >
          <Field label="Restaurant name">
            <input value={restName} onChange={(e) => setRestName(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Address">
            <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Phone">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
          </Field>
        </Panel>

        <Panel title="Urdu" subtitle="Language of item and category names" loading={saving === "urdu"}>
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink-mid">Show item &amp; category names in Urdu</span>
            <Switch checked={urdu} onChange={toggleUrdu} />
          </div>
          <p className="mt-2 text-xs text-ink-faint">
            When on, the POS, the kitchen slip and the invoice use each item&apos;s Urdu name, and the POS category tabs use each category&apos;s Urdu name (add them under Menu). Anything without an Urdu name keeps its English name.
          </p>
        </Panel>

        <Panel title="Payment methods" subtitle="Options shown at checkout">
          <div className="mb-3">
            <ReorderableList
              items={methods}
              onChange={reorderMethods}
              renderRow={(m) => (
                <>
                  <span>{m.name}</span>
                  <button onClick={() => removeMethod(m)} className="text-xs text-ink-faint hover:text-crimson-400">✕</button>
                </>
              )}
            />
            {methods.length === 0 && <p className="text-xs text-ink-faint">No payment methods yet, add one below.</p>}
            {methods.length > 1 && <p className="mt-2 text-[11px] text-ink-faint">Drag or use the arrows to change the order shown at checkout.</p>}
          </div>
          {methodError && <p className="mb-2 text-xs text-crimson-400">{methodError}</p>}
          <div className="flex gap-2">
            <input value={newMethod} onChange={(e) => setNewMethod(e.target.value)} placeholder="e.g. UPaisa" className="flex-1 rounded-lg border border-line bg-raised px-3 py-2 text-sm" />
            <button onClick={addMethod} className="shrink-0 rounded-md bg-chili-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-chili-600">Add</button>
          </div>
        </Panel>
      </div>

      <h2 className="mb-1 mt-8 font-display text-lg font-bold">Printers</h2>
      <p className="mb-4 text-sm text-ink-mid">Saved per computer, since a USB or network printer only makes sense on the PC that reaches it.</p>
      <PrinterSettings />
    </main>
  );
}
