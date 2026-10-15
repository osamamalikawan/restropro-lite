"use client";
import { useCallback, useEffect, useState } from "react";
import {
  PrinterConfig,
  PrinterRole,
  PrinterStatus,
  buildTestPayload,
  checkPrinterStatus,
  hasTauri,
  invokeTauri,
  loadPrinterConfig,
  printBytes,
  savePrinterConfig,
} from "./printers"; // adjust the path to wherever you put printers.ts

const POLL_MS = 15000;

const DOT: Record<PrinterStatus["state"], string> = {
  connected: "bg-basil-400",
  disconnected: "bg-crimson-400",
  checking: "bg-turmeric-400",
  unconfigured: "bg-ink-mid",
};
const LABEL: Record<PrinterStatus["state"], string> = {
  connected: "Connected",
  disconnected: "Not connected",
  checking: "Checking…",
  unconfigured: "Not set up",
};

function PrinterCard({ role, title, subtitle }: { role: PrinterRole; title: string; subtitle: string }) {
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState<PrinterConfig>({ mode: "none" });
  const [draft, setDraft] = useState<PrinterConfig>({ mode: "none" });
  const [status, setStatus] = useState<PrinterStatus>({ state: "checking", detail: "Checking…" });
  const [installed, setInstalled] = useState<string[]>([]);
  const [comPorts, setComPorts] = useState<{ name: string; description: string; bluetooth: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);

  // Load this machine's saved config once, on the client.
  useEffect(() => {
    const cfg = loadPrinterConfig(role);
    setSaved(cfg);
    setDraft(cfg);
    setLoaded(true);
  }, [role]);

  // Check status now and then keep polling while a printer is configured.
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    const run = async () => {
      const s = await checkPrinterStatus(saved);
      if (!cancelled) setStatus(s);
    };
    setStatus({ state: saved.mode === "none" ? "unconfigured" : "checking", detail: "Checking…" });
    run();
    if (saved.mode === "none") return;
    const id = setInterval(run, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [saved, loaded]);

  const loadInstalled = useCallback(async () => {
    if (!hasTauri()) return;
    try {
      setInstalled(await invokeTauri<string[]>("list_windows_printers"));
    } catch (e) {
      setMsg({ ok: false, message: String(e) });
    }
  }, []);

  useEffect(() => {
    if (draft.mode === "usb" && installed.length === 0) loadInstalled();
  }, [draft.mode, installed.length, loadInstalled]);

  const loadComPorts = useCallback(async () => {
    if (!hasTauri()) return;
    try {
      setComPorts(await invokeTauri("list_serial_ports"));
    } catch (e) {
      setMsg({ ok: false, message: String(e) });
    }
  }, []);

  useEffect(() => {
    if (draft.mode === "serial" && comPorts.length === 0) loadComPorts();
  }, [draft.mode, comPorts.length, loadComPorts]);

  function chooseMode(mode: PrinterConfig["mode"]) {
    setMsg(null);
    if (mode === "usb") setDraft({ mode: "usb", printerName: saved.mode === "usb" ? saved.printerName : "" });
    else if (mode === "lan")
      setDraft(saved.mode === "lan" ? saved : { mode: "lan", ip: "192.168.1.", port: 9100 });
    else if (mode === "serial") setDraft(saved.mode === "serial" ? saved : { mode: "serial", port: "", baud: 9600 });
    else setDraft({ mode: "none" });
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  function save() {
    if (draft.mode === "usb" && !draft.printerName) {
      setMsg({ ok: false, message: "Pick a printer first." });
      return;
    }
    if (draft.mode === "serial" && !draft.port) {
      setMsg({ ok: false, message: "Pick the printer's COM port first." });
      return;
    }
    if (draft.mode === "lan" && !draft.ip.trim()) {
      setMsg({ ok: false, message: "Enter the printer's IP address." });
      return;
    }
    savePrinterConfig(role, draft);
    setSaved(draft);
    setMsg({ ok: true, message: "Saved on this computer." });
  }

  async function testPrint() {
    setBusy(true);
    setMsg(null);
    try {
      await printBytes(saved, buildTestPayload(`${title} — test print`));
      setMsg({ ok: true, message: "Test print sent." });
    } catch (e) {
      setMsg({ ok: false, message: String(e) });
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "rounded-md bg-raised border border-line px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-chili-500";
  const segCls = (active: boolean) =>
    `px-3 py-1.5 text-sm rounded-md border ${
      active ? "bg-chili-500 text-white border-chili-500" : "bg-raised border-line"
    }`;

  return (
    <section className="rounded-xl border border-line bg-surface p-5 mb-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h2 className="font-display font-semibold text-base">{title}</h2>
          <p className="text-xs text-ink-mid">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0" title={status.detail}>
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${DOT[status.state]}`} />
          <span className="text-xs font-medium">{LABEL[status.state]}</span>
        </div>
      </div>
      {status.state !== "unconfigured" && <p className="text-xs text-ink-mid mb-4">{status.detail}</p>}
      {status.state === "unconfigured" && <div className="mb-4" />}

      <div className="flex gap-2 mb-4">
        <button className={segCls(draft.mode === "none")} onClick={() => chooseMode("none")}>
          Not used
        </button>
        <button className={segCls(draft.mode === "usb")} onClick={() => chooseMode("usb")}>
          USB
        </button>
        <button className={segCls(draft.mode === "lan")} onClick={() => chooseMode("lan")}>
          Network / LAN
        </button>
        <button className={segCls(draft.mode === "serial")} onClick={() => chooseMode("serial")}>
          Bluetooth / COM
        </button>
      </div>

      {draft.mode === "usb" && (
        <div className="mb-4">
          <p className="text-xs text-ink-mid mb-2">
            Choose a printer installed in Windows (install its driver first).
          </p>
          <div className="flex gap-2">
            <select
              value={draft.printerName}
              onChange={(e) => setDraft({ mode: "usb", printerName: e.target.value })}
              className={`${inputCls} flex-1`}
            >
              <option value="">Select a printer…</option>
              {draft.printerName && !installed.includes(draft.printerName) && (
                <option value={draft.printerName}>{draft.printerName} (not found on this PC)</option>
              )}
              {installed.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <button
              onClick={loadInstalled}
              className="px-4 py-2 rounded-lg border border-line bg-raised text-sm font-medium"
            >
              Refresh
            </button>
          </div>
        </div>
      )}

      {draft.mode === "serial" && (
        <div className="mb-4">
          <p className="text-xs text-ink-mid mb-2">
            For Bluetooth mini printers: first pair the printer in Windows (Settings → Bluetooth &amp; devices → Add
            device), then pick its COM port below. Switch the printer on before printing. Most mini printers are 58 mm
            — set Paper width to 58mm in Settings so receipts fit.
          </p>
          <div className="flex gap-2">
            <select
              value={draft.port}
              onChange={(e) => setDraft({ mode: "serial", port: e.target.value, baud: draft.baud })}
              className={`${inputCls} flex-1`}
            >
              <option value="">Select a COM port…</option>
              {draft.port && !comPorts.some((p) => p.name === draft.port) && (
                <option value={draft.port}>{draft.port} (not found on this PC)</option>
              )}
              {comPorts.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name} — {p.description}
                </option>
              ))}
            </select>
            <select
              value={draft.baud}
              onChange={(e) => setDraft({ mode: "serial", port: draft.port, baud: Number(e.target.value) })}
              className={`${inputCls} w-28`}
              title="Speed. Bluetooth printers usually ignore this; 9600 works for most."
            >
              {[9600, 19200, 38400, 57600, 115200].map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <button
              onClick={loadComPorts}
              className="px-4 py-2 rounded-lg border border-line bg-raised text-sm font-medium"
            >
              Refresh
            </button>
          </div>
          {comPorts.length === 0 && (
            <p className="text-xs text-ink-mid mt-2">
              No COM ports found. If the printer is paired but no port appears, it is probably a Bluetooth LE-only model,
              which this setting can't reach.
            </p>
          )}
        </div>
      )}

      {draft.mode === "lan" && (
        <div className="mb-4">
          <p className="text-xs text-ink-mid mb-2">
            The printer's IP from its self-test page. Port is almost always 9100.
          </p>
          <div className="flex gap-2">
            <input
              value={draft.ip}
              onChange={(e) => setDraft({ mode: "lan", ip: e.target.value, port: draft.port })}
              placeholder="192.168.1.50"
              className={`${inputCls} flex-1`}
            />
            <input
              value={String(draft.port)}
              onChange={(e) =>
                setDraft({ mode: "lan", ip: draft.ip, port: Number(e.target.value.replace(/\D/g, "")) || 0 })
              }
              placeholder="9100"
              className={`${inputCls} w-24`}
            />
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={!dirty}
          className="px-4 py-2 rounded-lg bg-chili-500 text-white text-sm font-semibold disabled:opacity-50"
        >
          Save
        </button>
        <button
          onClick={testPrint}
          disabled={busy || saved.mode === "none" || dirty}
          className="px-4 py-2 rounded-lg border border-line bg-raised text-sm font-medium disabled:opacity-50"
        >
          {busy ? "Printing…" : "Test print"}
        </button>
      </div>

      {msg && <p className={`text-xs mt-3 ${msg.ok ? "text-basil-400" : "text-crimson-400"}`}>{msg.message}</p>}
    </section>
  );
}

export function PrinterSettings() {
  return (
    <div className="max-w-2xl">
      {!hasTauri() && (
        <div className="rounded-lg border border-turmeric-500/40 bg-turmeric-500/10 px-4 py-3 text-sm text-turmeric-400 mb-5">
          Printers can only be reached from the Restro Pro POS desktop app. Settings are saved per computer.
        </div>
      )}
      <PrinterCard
        role="receipt"
        title="Invoice / receipt printer"
        subtitle="Main printer for customer invoices and receipts."
      />
      <PrinterCard
        role="kitchen"
        title="Kitchen slip printer"
        subtitle="Prints order slips for the kitchen."
      />
    </div>
  );
}
