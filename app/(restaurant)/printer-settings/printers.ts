// Shared printer helpers for the Restro Pro POS web app.
//
// Printer settings are stored PER MACHINE (localStorage), not on the server: a USB printer
// name or a LAN IP only means something on the PC that is physically connected to it, and
// printing itself happens locally through the Tauri shell.

export type PrinterRole = "receipt" | "kitchen";

export type PrinterConfig =
  | { mode: "none" }
  | { mode: "usb"; printerName: string }
  | { mode: "lan"; ip: string; port: number }
  // Bluetooth mini printers (paired in Windows) and USB-serial printers show up as a COM port.
  | { mode: "serial"; port: string; baud: number };

export type PrinterStatus = {
  state: "unconfigured" | "checking" | "connected" | "disconnected";
  detail: string;
};

const storageKey = (role: PrinterRole) => `restropro.printer.${role}`;

export function hasTauri(): boolean {
  return typeof window !== "undefined" && !!(window as any).__TAURI__;
}

export async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const tauri = (window as any).__TAURI__;
  if (!tauri?.core?.invoke) throw new Error("Tauri bridge not found — open this in the desktop app.");
  return tauri.core.invoke(cmd, args) as Promise<T>;
}

export function loadPrinterConfig(role: PrinterRole): PrinterConfig {
  try {
    const raw = window.localStorage.getItem(storageKey(role));
    if (!raw) return { mode: "none" };
    const parsed = JSON.parse(raw);
    if (parsed?.mode === "usb" && typeof parsed.printerName === "string") return parsed;
    if (parsed?.mode === "lan" && typeof parsed.ip === "string") {
      return { mode: "lan", ip: parsed.ip, port: Number(parsed.port) || 9100 };
    }
    if (parsed?.mode === "serial" && typeof parsed.port === "string" && parsed.port) {
      return { mode: "serial", port: parsed.port, baud: Number(parsed.baud) || 9600 };
    }
  } catch {
    /* fall through */
  }
  return { mode: "none" };
}

export function savePrinterConfig(role: PrinterRole, config: PrinterConfig): void {
  try {
    window.localStorage.setItem(storageKey(role), JSON.stringify(config));
  } catch {
    /* storage unavailable — settings just won't persist */
  }
}

/** Connected / not-connected check for one printer config. */
export async function checkPrinterStatus(config: PrinterConfig): Promise<PrinterStatus> {
  if (config.mode === "none") {
    return { state: "unconfigured", detail: "No printer set up" };
  }
  if (!hasTauri()) {
    return { state: "disconnected", detail: "Open this in the desktop app to reach printers" };
  }
  try {
    if (config.mode === "lan") {
      await invokeTauri("test_printer_connection", { ip: config.ip, port: config.port });
      return { state: "connected", detail: `Reachable at ${config.ip}:${config.port}` };
    }
    if (config.mode === "serial") {
      const r = await invokeTauri<{ present: boolean; detail: string }>("check_serial_port", { port: config.port });
      return { state: r.present ? "connected" : "disconnected", detail: r.detail };
    }
    const s = await invokeTauri<{ installed: boolean; online: boolean; detail: string }>(
      "check_windows_printer",
      { printerName: config.printerName },
    );
    return s.installed && s.online
      ? { state: "connected", detail: s.detail }
      : { state: "disconnected", detail: s.detail };
  } catch (e) {
    return { state: "disconnected", detail: String(e) };
  }
}

/** Sends raw ESC/POS bytes using whichever connection type the config says. */
export async function printBytes(config: PrinterConfig, data: number[]): Promise<void> {
  if (config.mode === "usb") {
    await invokeTauri("print_raw_windows", { printerName: config.printerName, data });
  } else if (config.mode === "lan") {
    await invokeTauri("print_raw", { ip: config.ip, port: config.port, data });
  } else if (config.mode === "serial") {
    await invokeTauri("print_raw_serial", { port: config.port, baud: config.baud, data });
  } else {
    throw new Error("No printer is set up for this role yet.");
  }
}

/** Use this from checkout / kitchen code: printToRole("receipt", bytes) or ("kitchen", bytes). */
export async function printToRole(role: PrinterRole, data: number[]): Promise<void> {
  await printBytes(loadPrinterConfig(role), data);
}

/** ESC @ (initialize) + label + feeds + GS V 0 (full cut). Plain ASCII, widely compatible. */
export function buildTestPayload(label: string): number[] {
  const text = new TextEncoder().encode(`Restro Pro POS\n${label}\n${new Date().toLocaleString()}\n\n\n`);
  return [0x1b, 0x40, ...Array.from(text), 0x1d, 0x56, 0x00];
}

// ---- Kitchen slip paper margins (per computer, like the printer settings) ----------------------------------
// The slip is drawn as one image. topMm / bottomMm are white paper added above / below it. feedToCut makes the
// printer feed the paper to its cutter before cutting, so the bottom margin is exactly bottomMm and the last
// line is never cut off. NOTE: the blank paper that sits between the print head and the cutter after every cut
// is a printer hardware distance; no software margin can remove it, so topMm defaults to 0.
export type SlipMargins = { topMm: number; bottomMm: number; feedToCut: boolean };
export const DEFAULT_SLIP_MARGINS: SlipMargins = { topMm: 0, bottomMm: 5, feedToCut: true };
const MARGINS_KEY = "restropro.kitchenSlip.margins";
const clampMm = (n: unknown, fallback: number) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(30, Math.max(0, v)) : fallback;
};

export function loadSlipMargins(): SlipMargins {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(MARGINS_KEY) : null;
    if (raw) {
      const p = JSON.parse(raw);
      return {
        topMm: clampMm(p?.topMm, DEFAULT_SLIP_MARGINS.topMm),
        bottomMm: clampMm(p?.bottomMm, DEFAULT_SLIP_MARGINS.bottomMm),
        feedToCut: p?.feedToCut !== false,
      };
    }
  } catch {
    /* use the defaults */
  }
  return { ...DEFAULT_SLIP_MARGINS };
}

export function saveSlipMargins(m: SlipMargins): void {
  try {
    window.localStorage.setItem(MARGINS_KEY, JSON.stringify({ topMm: clampMm(m.topMm, 0), bottomMm: clampMm(m.bottomMm, 5), feedToCut: m.feedToCut }));
  } catch {
    /* storage unavailable: the settings just won't persist */
  }
}
