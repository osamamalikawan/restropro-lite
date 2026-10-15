// POS receipt / kitchen-slip builders (ASCII ESC/POS, with Urdu lines drawn as bitmaps) + the glue that sends them to the
// right printer role. Printer connections themselves are configured in Printer settings and
// stored per machine — see app/(restaurant)/printer-settings/printers.ts.

// NOTE: deliberately self-contained (same localStorage keys + Tauri commands as
// app/(restaurant)/printer-settings/printers.ts). The offline desktop build moves the whole
// app/(restaurant) folder away, so the POS must not import from it.
type PrinterConfig =
  | { mode: "none" }
  | { mode: "usb"; printerName: string }
  | { mode: "lan"; ip: string; port: number }
  | { mode: "serial"; port: string; baud: number };

const hasTauri = () => typeof window !== "undefined" && !!(window as any).__TAURI__;

function loadPrinterConfig(role: "receipt" | "kitchen"): PrinterConfig {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(`restropro.printer.${role}`) || "null");
    if (parsed?.mode === "usb" && typeof parsed.printerName === "string") return parsed;
    if (parsed?.mode === "lan" && typeof parsed.ip === "string") return { mode: "lan", ip: parsed.ip, port: Number(parsed.port) || 9100 };
    if (parsed?.mode === "serial" && typeof parsed.port === "string" && parsed.port) return { mode: "serial", port: parsed.port, baud: Number(parsed.baud) || 9600 };
  } catch {}
  return { mode: "none" };
}

async function printToRole(role: "receipt" | "kitchen", data: number[]): Promise<void> {
  const invoke = (window as any).__TAURI__?.core?.invoke;
  if (!invoke) throw new Error("Tauri bridge not found — open this in the desktop app.");
  const c = loadPrinterConfig(role);
  if (c.mode === "usb") await invoke("print_raw_windows", { printerName: c.printerName, data });
  else if (c.mode === "lan") await invoke("print_raw", { ip: c.ip, port: c.port, data });
  else if (c.mode === "serial") await invoke("print_raw_serial", { port: c.port, baud: c.baud, data });
  else throw new Error(`no ${role === "kitchen" ? "kitchen" : "receipt"} printer is set up (Printer settings)`);
}


export type SaveAction = "save" | "kitchen" | "invoice";

export type SaleSnapshot = {
  restaurantName: string;
  address: string;
  phone: string;
  header: string;
  footer: string;
  paper: string; // settings.paper_width, e.g. "80" or "58mm"
  cashier: string;
  orderTypeLabel: string; // e.g. "Dine in · Table 4", "Takeaway"
  customerName: string;
  customerPhone: string;
  items: { name: string; qty: number; price: number; note?: string }[];
  /** order-level instructions typed in the checkout popup */
  orderNote?: string;
  /** delivery orders only: where it goes */
  deliveryAddress?: string;
  deliveryArea?: string;
  /** money taken off the items before tax (0 / absent when none) */
  discount?: number;
  subtotal: number;
  delivery: number;
  taxLabel: string; // e.g. "Cash tax (17%)"
  tax: number;
  fee: number; // FBR invoicing fee (0 when FBR is off)
  serviceCharge?: number; // dine-in service charge (0 / absent when none)
  serviceLabel?: string; // e.g. "Service charge (10%)"
  total: number;
  payments: { method: string; amount: number }[];
  /** Order type in English for the kitchen slip's boxed heading ("Take Away", "Dine In", "Delivery"). */
  orderTypeEn?: string;
  /** Lite app: print the fixed labels (Subtotal, Total...) in Urdu as well. */
  urdu?: boolean;
  /** Settings -> Receipt templates: "classic" | "modern" | "minimal" | "bold" (default classic). */
  template?: string;
  /** FBR block printed on the invoice when enabled in Settings -> FBR Digital Invoicing. */
  fbr?: { enabled: boolean; ntn: string; strn: string; posId: string } | null;
};

const ESC = 0x1b;
const GS = 0x1d;
const money = (n: number) => n.toLocaleString("en-US");
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, "?"); // thermal code pages choke on Unicode (₨, Urdu…)

/* ------------------------------------------------------------------------------------------
 * Urdu / Arabic-script support.
 * Thermal printers have no Urdu code page and cannot join Urdu letters, so any line that contains
 * Urdu is drawn on a canvas with a real font, converted to a 1-bit bitmap and sent as an ESC/POS
 * raster image (GS v 0). Lines without Urdu are still plain text, exactly as before.
 * ---------------------------------------------------------------------------------------- */
const URDU_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
export const hasUrdu = (s: string) => URDU_RE.test(s);

/** Printable width in dots: 80mm = 576, 58mm = 384. Lower the 576 (e.g. 512) if the right edge gets cut off. */
const dotsFor = (paper: string) => (/58/.test(paper) ? 384 : 576);

type Align = "left" | "center" | "right";

const URDU_FALLBACK = '"Noto Naskh Arabic", "Segoe UI", Tahoma, sans-serif';
function urduFontFamily(): string {
  try {
    const v = getComputedStyle(document.body).getPropertyValue("--font-urdu").trim(); // set by next/font in app/layout.tsx
    if (v) return `${v}, ${URDU_FALLBACK}`;
  } catch {}
  return URDU_FALLBACK;
}

/** Makes sure the Urdu font is downloaded before we draw with it (canvas never waits for fonts). */
async function ensureUrduFont(): Promise<void> {
  try {
    const fam = urduFontFamily();
    await Promise.race([
      Promise.all([document.fonts.load(`400 26px ${fam}`, "اب"), document.fonts.load(`700 26px ${fam}`, "اب")]),
      new Promise((r) => setTimeout(r, 2000)),
    ]);
  } catch {}
}

/**
 * Draws one printable row and returns the ESC/POS raster bytes (null if canvas is unavailable).
 *  - text: the Urdu (or mixed) text; it is wrapped by pixel width and drawn right-to-left.
 *  - qty:  optional "2 x" shown at the right edge, before the name (reads first in Urdu).
 *  - price: optional amount shown at the left edge of the last line.
 */
function renderRow(
  widthDots: number,
  px: number,
  bold: boolean,
  o: { text: string; align: Align; qty?: string; price?: string },
): number[] | null {
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true } as any) as CanvasRenderingContext2D | null;
    if (!ctx) return null;
    const font = `${bold ? 700 : 400} ${px}px ${urduFontFamily()}`;
    ctx.font = font;
    const gap = Math.round(px * 0.5);
    ctx.direction = "ltr";
    const qtyW = o.qty ? Math.ceil(ctx.measureText(o.qty).width) + gap : 0;
    const priceW = o.price ? Math.ceil(ctx.measureText(o.price).width) + gap : 0;
    const maxW = Math.max(60, widthDots - qtyW - priceW);

    // wrap in logical (reading) order
    ctx.direction = "rtl";
    const lines: string[] = [];
    let cur = "";
    for (const w of o.text.trim().split(/\s+/)) {
      const t = cur ? `${cur} ${w}` : w;
      if (cur && ctx.measureText(t).width > maxW) {
        lines.push(cur);
        cur = w;
      } else cur = t;
    }
    if (cur) lines.push(cur);

    const lineH = Math.round(px * 1.7); // Urdu letters have tall marks above and below
    const H = lineH * lines.length + 6;
    canvas.width = widthDots; // resizing resets the context, so set everything again
    canvas.height = H;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, widthDots, H);
    ctx.fillStyle = "#000";
    ctx.font = font;
    ctx.textBaseline = "middle";
    ctx.textAlign = "right";

    lines.forEach((ln, i) => {
      const y = i * lineH + lineH / 2 + 3;
      ctx.direction = "rtl";
      const w = ctx.measureText(ln).width;
      const right = o.qty || o.price ? widthDots - 4 - qtyW : o.align === "center" ? (widthDots + w) / 2 : widthDots - 4;
      ctx.fillText(ln, right, y);
      ctx.direction = "ltr";
      if (i === 0 && o.qty) ctx.fillText(o.qty, widthDots - 4, y);
      if (i === lines.length - 1 && o.price) {
        ctx.textAlign = "left";
        ctx.fillText(o.price, 4, y);
        ctx.textAlign = "right";
      }
    });

    // 1-bit raster: GS v 0 m xL xH yL yH d...
    const data = ctx.getImageData(0, 0, widthDots, H).data;
    const bpr = Math.ceil(widthDots / 8);
    const out: number[] = [GS, 0x76, 0x30, 0x00, bpr & 0xff, bpr >> 8, H & 0xff, H >> 8];
    for (let y = 0; y < H; y++) {
      for (let bx = 0; bx < bpr; bx++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = bx * 8 + bit;
          if (x >= widthDots) continue;
          const i = (y * widthDots + x) * 4;
          const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          if (lum < 150) byte |= 0x80 >> bit;
        }
        out.push(byte);
      }
    }
    return out;
  } catch {
    return null;
  }
}

class Buf {
  bytes: number[] = [ESC, 0x40]; // initialise
  private al: Align = "left";
  private isBig = false;
  private isBold = false;
  constructor(public cols: number, public dots: number) {}
  private push(more: number[]) {
    for (let i = 0; i < more.length; i++) this.bytes.push(more[i]);
  }
  text(s: string) {
    for (const ch of ascii(s)) this.bytes.push(ch.charCodeAt(0));
    return this;
  }
  line(s = "") {
    if (hasUrdu(s)) {
      const img = renderRow(this.dots, this.isBig ? 40 : 26, this.isBold || this.isBig, { text: s, align: this.al });
      if (img) {
        this.push(img);
        return this;
      }
    }
    return this.text(s).raw(0x0a);
  }
  raw(...b: number[]) {
    this.bytes.push(...b);
    return this;
  }
  align(a: "left" | "center" | "right") {
    this.al = a;
    return this.raw(ESC, 0x61, a === "left" ? 0 : a === "center" ? 1 : 2);
  }
  bold(on: boolean) {
    this.isBold = on;
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }
  reverse(on: boolean) {
    return this.raw(GS, 0x42, on ? 1 : 0);
  }
  size(big: boolean) {
    this.isBig = big;
    return this.raw(GS, 0x21, big ? 0x11 : 0x00);
  }
  rule(ch = "-") {
    return this.line(ch.repeat(this.cols));
  }
  /** Plain-text row: label on the left, amount on the right. */
  private rowText(left: string, right: string) {
    const l = ascii(left);
    const r = ascii(right);
    const space = Math.max(1, this.cols - l.length - r.length);
    return this.line(l.slice(0, Math.max(0, this.cols - r.length - 1)) + " ".repeat(space) + r);
  }
  row(left: string, right: string) {
    if (hasUrdu(left) || hasUrdu(right)) return this.itemRow("", left, right);
    return this.rowText(left, right);
  }
  /** Item line: "2 x" + name (Urdu drawn as a bitmap) + optional price. Falls back to ASCII text if drawing fails. */
  itemRow(qty: number | string, name: string, price: string) {
    const q = qty === "" ? "" : `${qty} x`;
    if (hasUrdu(name) || hasUrdu(price)) {
      const img = renderRow(this.dots, this.isBig ? 40 : 26, this.isBold || this.isBig, { text: name, align: "right", qty: q, price });
      if (img) {
        this.push(img);
        return this;
      }
    }
    return this.rowText(`${q} ${name}`.trim(), price);
  }
  cut() {
    return this.raw(0x0a, 0x0a, 0x0a, GS, 0x56, 0x00);
  }
}

/** Order-level instructions + delivery details, shared by the kitchen slip and the invoice. */
function printOrderExtras(b: Buf, s: SaleSnapshot, big: boolean) {
  if (s.deliveryArea || s.deliveryAddress) {
    b.bold(true).line("DELIVER TO").bold(false);
    if (s.deliveryAddress) for (const l of wrap(s.deliveryAddress, b.cols)) b.line(l);
    if (s.deliveryArea) b.line(`Area: ${s.deliveryArea}`);
  }
  if (s.orderNote) {
    b.bold(true).line("ORDER NOTE").bold(false);
    if (big) b.bold(true);
    for (const l of wrap(s.orderNote, b.cols)) b.line(l);
    if (big) b.bold(false);
  }
}

const colsFor = (paper: string) => (/58/.test(paper) ? 32 : 48);

function wrap(s: string, width: number): string[] {
  if (hasUrdu(s)) return [s]; // wrapped later by pixel width in renderRow
  const out: string[] = [];
  let cur = "";
  for (const word of ascii(s).split(" ")) {
    if ((cur + " " + word).trim().length > width) {
      if (cur) out.push(cur);
      cur = word;
    } else cur = (cur + " " + word).trim();
  }
  if (cur) out.push(cur);
  return out.length ? out : [""];
}

/* ------------------------------------------------------------------------------------------
 * Kitchen slip (lite layout): drawn as one bitmap so it can have the inverted band, the boxed order type and the
 * Urdu item table with amounts:
 *   [ Kitchen Print ]          black band, white text
 *   [   Take Away   ]          outlined box
 *      Walking Customer
 *   [214027]  27-Jul-26  7:07PM
 *   | رقم | آئٹم نام | تعداد |   amount | item | qty rows
 *   ADMIN        total qty        کل تعداد
 *   total amount                  کل رقم
 * ---------------------------------------------------------------------------------------- */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function slipDateTime(d = new Date()) {
  const date = `${String(d.getDate()).padStart(2, "0")}-${MONTHS[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`;
  const h = d.getHours() % 12 || 12;
  const time = `${h}:${String(d.getMinutes()).padStart(2, "0")}${d.getHours() < 12 ? "AM" : "PM"}`;
  return { date, time };
}

/** Canvas -> ESC/POS raster, cut into strips so printers with a small buffer don't choke on a tall image. */
function canvasToRaster(canvas: HTMLCanvasElement, widthDots: number): number[] {
  const ctx = canvas.getContext("2d", { willReadFrequently: true } as any) as CanvasRenderingContext2D;
  const H = canvas.height;
  const data = ctx.getImageData(0, 0, widthDots, H).data;
  const bpr = Math.ceil(widthDots / 8);
  const out: number[] = [];
  for (let y0 = 0; y0 < H; y0 += 200) {
    const h = Math.min(200, H - y0);
    out.push(GS, 0x76, 0x30, 0x00, bpr & 0xff, bpr >> 8, h & 0xff, h >> 8);
    for (let y = y0; y < y0 + h; y++) {
      for (let bx = 0; bx < bpr; bx++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const x = bx * 8 + bit;
          if (x >= widthDots) continue;
          const i = (y * widthDots + x) * 4;
          const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          if (lum < 150) byte |= 0x80 >> bit;
        }
        out.push(byte);
      }
    }
  }
  return out;
}

function renderKitchenSlip(s: SaleSnapshot, orderNo: string | number, W: number): number[] | null {
  try {
    const k = W / 576;
    const f = (n: number) => Math.max(1, Math.round(n * k));
    const LATIN = "Arial, Helvetica, sans-serif";
    const URDU = urduFontFamily();
    const fam = (t: string) => (hasUrdu(t) ? URDU : LATIN);
    const M = f(6); // outer margin
    const R = W - M;
    const qtyW = f(92);
    const amtW = f(132);
    const nameW = W - 2 * M - qtyW - amtW;
    const colQty = { l: R - qtyW, r: R };
    const colName = { l: R - qtyW - nameW, r: R - qtyW };
    const colAmt = { l: M, r: M + amtW };

    const probe = document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D;
    const setFont = (c: CanvasRenderingContext2D, px: number, bold: boolean, family: string) => (c.font = `${bold ? 700 : 400} ${px}px ${family}`);
    /** Wraps in reading order by pixel width. */
    const wrapPx = (t: string, px: number, bold: boolean, maxW: number) => {
      setFont(probe, px, bold, fam(t));
      probe.direction = hasUrdu(t) ? "rtl" : "ltr";
      const lines: string[] = [];
      let cur = "";
      for (const w of t.trim().split(/\s+/)) {
        const tt = cur ? `${cur} ${w}` : w;
        if (cur && probe.measureText(tt).width > maxW) {
          lines.push(cur);
          cur = w;
        } else cur = tt;
      }
      if (cur) lines.push(cur);
      return lines.length ? lines : [""];
    };

    const items = s.items.map((it) => ({
      qty: it.qty,
      lines: wrapPx(it.name, f(30), true, nameW - f(16)),
      amount: money(Math.round(it.price * it.qty * 100) / 100),
    }));
    const nameLineH = f(46);
    const rowH = (n: number) => Math.max(f(54), n * nameLineH + f(10));
    const customer = (s.customerName || "").trim() || "Walking Customer";
    const extra: string[] = [];
    if (s.customerPhone) extra.push(s.customerPhone);
    if (s.deliveryAddress) extra.push(...wrapPx(s.deliveryAddress, f(22), false, W - 2 * M));
    const totalQty = s.items.reduce((n, it) => n + it.qty, 0);

    // ---- vertical layout ----
    let y = 0;
    const Y: Record<string, number> = {};
    Y.band = y; y += f(60) + f(10);
    Y.box = y; y += f(70) + f(8);
    Y.cust = y; y += f(34) + extra.length * f(30) + f(6);
    Y.info = y; y += f(52) + f(10);
    Y.head = y; y += f(56);
    Y.rows = y; y += items.reduce((n, it) => n + rowH(it.lines.length), 0);
    Y.foot = y; y += f(50);
    Y.total = y; y += f(56) + (s.delivery > 0 ? f(40) : 0);
    const H = y + f(16);

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true } as any) as CanvasRenderingContext2D;
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = "middle";
    const text = (t: string, x: number, cy: number, px: number, o: { bold?: boolean; align?: CanvasTextAlign; color?: string } = {}) => {
      setFont(ctx, px, o.bold ?? false, fam(t));
      ctx.direction = hasUrdu(t) ? "rtl" : "ltr";
      ctx.textAlign = o.align ?? "center";
      ctx.fillStyle = o.color ?? "#000";
      ctx.fillText(t, x, cy);
    };
    const invert = (x: number, top: number, w: number, h: number) => {
      ctx.fillStyle = "#000";
      ctx.fillRect(x, top, w, h);
    };

    // band
    invert(M, Y.band, W - 2 * M, f(60));
    text("Kitchen Print", W / 2, Y.band + f(31), f(38), { bold: true, color: "#fff" });
    // boxed order type
    ctx.strokeStyle = "#000";
    ctx.lineWidth = Math.max(2, f(3));
    ctx.strokeRect(M + 1, Y.box + 1, W - 2 * M - 2, f(70) - 2);
    text(s.orderTypeEn || s.orderTypeLabel, W / 2, Y.box + f(36), f(40), { bold: true });
    // customer
    text(customer, W / 2, Y.cust + f(17), f(26), { bold: true });
    extra.forEach((l, i) => text(l, W / 2, Y.cust + f(34) + i * f(30) + f(14), f(22)));
    // order number (inverted), date, time
    const { date, time } = slipDateTime();
    const noStr = String(orderNo);
    setFont(ctx, f(32), true, LATIN);
    const noW = Math.min(W * 0.4, Math.ceil(ctx.measureText(noStr).width) + f(24));
    invert(M, Y.info, noW, f(52));
    text(noStr, M + noW / 2, Y.info + f(27), f(32), { bold: true, color: "#fff" });
    text(date, M + noW + (W - M - noW - M) * 0.32, Y.info + f(27), f(28), { bold: true });
    text(time, R, Y.info + f(27), f(26), { bold: true, align: "right" });

    // table frame + headers
    ctx.strokeStyle = "#000";
    ctx.lineWidth = Math.max(1, f(2));
    ctx.setLineDash([f(3), f(4)]);
    const tableTop = Y.head;
    const tableBottom = Y.foot;
    for (const x of [colAmt.r, colName.l]) {
      ctx.beginPath();
      ctx.moveTo(x, tableTop);
      ctx.lineTo(x, tableBottom);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(M, tableTop);
    ctx.lineTo(R, tableTop);
    ctx.moveTo(M, tableBottom);
    ctx.lineTo(R, tableBottom);
    ctx.moveTo(M, Y.rows);
    ctx.lineTo(R, Y.rows);
    ctx.stroke();
    ctx.setLineDash([]);
    const hy = tableTop + f(28);
    text("رقم", (colAmt.l + colAmt.r) / 2, hy, f(28), { bold: true });
    text("آئٹم نام", (colName.l + colName.r) / 2, hy, f(28), { bold: true });
    text("تعداد", (colQty.l + colQty.r) / 2, hy, f(28), { bold: true });

    // rows
    let ry = Y.rows;
    for (const it of items) {
      const h = rowH(it.lines.length);
      const cy = ry + h / 2;
      text(String(it.qty), (colQty.l + colQty.r) / 2, cy, f(36), { bold: true });
      const top = ry + (h - it.lines.length * nameLineH) / 2;
      it.lines.forEach((ln, i) => text(ln, colName.r - f(8), top + i * nameLineH + nameLineH / 2, f(30), { bold: true, align: "right" }));
      text(it.amount, (colAmt.l + colAmt.r) / 2, cy, f(28), { bold: true });
      ry += h;
    }

    // footer: cashier, total quantity
    const fy = Y.foot + f(26);
    text(ascii(s.cashier).toUpperCase(), M, fy, f(24), { align: "left" });
    text(String(totalQty), R - f(150), fy, f(32), { bold: true });
    text("کل تعداد", R, fy, f(28), { bold: true, align: "right" });

    // total amount (and delivery, when there is one)
    let ty = Y.total + f(28);
    if (s.delivery > 0) {
      text(money(s.delivery), M + f(10), ty, f(28), { align: "left" });
      text("ڈیلیوری", R, ty, f(28), { align: "right" });
      ty += f(40);
    }
    invert(M, ty - f(26), W - 2 * M, f(52));
    text(`Rs ${money(s.total)}`, M + f(12), ty, f(34), { bold: true, align: "left", color: "#fff" });
    text("کل رقم", R - f(10), ty, f(32), { bold: true, align: "right", color: "#fff" });

    return canvasToRaster(canvas, W);
  } catch {
    return null;
  }
}

/** Lite kitchen slip: the drawn layout above, or the plain-text slip when canvas isn't available. */
export function buildKitchenSlip(s: SaleSnapshot, orderNo: string | number, label?: string): number[] {
  const img = renderKitchenSlip(s, orderNo, dotsFor(s.paper));
  if (!img) return buildKitchenSlipText(s, orderNo, label);
  const b = new Buf(colsFor(s.paper), dotsFor(s.paper));
  for (let i = 0; i < img.length; i++) b.bytes.push(img[i]);
  return b.cut().bytes;
}

/** `label` replaces the "#order no" line (a held ticket has no order number yet: "Table 5", "Takeaway"). */
function buildKitchenSlipText(s: SaleSnapshot, orderNo: string | number, label?: string): number[] {
  const b = new Buf(colsFor(s.paper), dotsFor(s.paper));
  b.align("center").bold(true).size(true).line("KITCHEN").size(false).bold(false);
  b.bold(true).size(true).line(label || `#${orderNo}`).size(false).bold(false);
  b.line(s.orderTypeLabel).line(new Date().toLocaleString());
  b.align("left").rule();
  for (const it of s.items) {
    b.bold(true).size(true);
    if (hasUrdu(it.name)) b.itemRow(it.qty, it.name, "");
    else for (const l of wrap(`${it.qty} x ${it.name}`, Math.floor(b.cols / 2))) b.line(l);
    b.size(false);
    if (it.note) for (const l of wrap(`  >> ${it.note}`, b.cols)) b.line(l);
    b.bold(false);
  }
  b.rule();
  printOrderExtras(b, s, true);
  if (s.deliveryArea || s.deliveryAddress || s.orderNote) b.rule();
  if (s.customerName || s.customerPhone) b.line([s.customerName, s.customerPhone].filter(Boolean).join(" "));
  return b.cut().bytes;
}

/** Prints the invoice in the template picked in Settings -> Receipt templates. The four designs
 *  mirror the on-screen previews as far as a thermal printer allows: Classic (plain, dashed
 *  rules), Modern (header band + boxed total), Minimal (whitespace, no rules), Bold (all bold,
 *  big total). Everything else — items, tax, FBR block, payments — is the same in every design. */
export function buildInvoice(s: SaleSnapshot, orderNo: string | number): number[] {
  const t = s.template === "modern" || s.template === "minimal" || s.template === "bold" ? s.template : "classic";
  const b = new Buf(colsFor(s.paper), dotsFor(s.paper));
  const L = (en: string, ur: string) => (s.urdu ? ur : en); // lite app: fixed labels in Urdu
  const rule = (ch = "-") => (t === "minimal" ? b.line() : t === "modern" ? b.rule(ch === "-" ? "-" : ch) : b.rule(ch));

  // ---- header ----
  b.align("center");
  if (t === "modern") {
    b.reverse(true).bold(true);
    for (const l of wrap(s.restaurantName, b.cols)) b.line(l.padStart(Math.floor((b.cols + l.length) / 2)).padEnd(b.cols));
    b.reverse(false).bold(false);
  } else {
    b.bold(true).size(t !== "minimal");
    for (const l of wrap(s.restaurantName, t === "minimal" ? b.cols : Math.floor(b.cols / 2))) b.line(l);
    b.size(false).bold(t === "bold");
  }
  if (s.address) b.line(s.address);
  if (s.phone) b.line(s.phone);
  if (s.header) b.line(s.header);
  b.align("left");
  if (t === "minimal") b.line();
  rule();

  // ---- order info ----
  b.bold(true).line(`Order #${orderNo}`).bold(false);
  b.line(new Date().toLocaleString());
  b.line(s.orderTypeLabel).line(`Cashier: ${s.cashier}`);
  if (s.customerName || s.customerPhone) b.line(`Customer: ${[s.customerName, s.customerPhone].filter(Boolean).join(" ")}`);
  printOrderExtras(b, s, false);
  rule();

  // ---- items ----
  b.bold(t === "bold");
  for (const it of s.items) {
    if (hasUrdu(it.name)) b.itemRow(it.qty, it.name, money(it.price * it.qty));
    else {
      const lines = wrap(`${it.qty} x ${it.name}`, b.cols - 12);
      lines.forEach((l, i) => (i === lines.length - 1 ? b.row(l, money(it.price * it.qty)) : b.line(l)));
    }
    if (it.note) for (const l of wrap(`  >> ${it.note}`, b.cols)) b.line(l);
  }
  b.bold(false);
  rule();

  // ---- totals ----
  b.row(L("Subtotal", "سب ٹوٹل"), money(s.subtotal));
  if ((s.discount ?? 0) > 0) b.row("Discount", `-${money(s.discount!)}`);
  if (s.delivery > 0) b.row(L("Delivery", "ڈیلیوری"), money(s.delivery));
  if ((s.serviceCharge ?? 0) > 0) b.row(s.serviceLabel ?? "Service charge", money(s.serviceCharge!));
  if (s.tax > 0) b.row(s.taxLabel, money(s.tax));
  if (s.fee > 0) b.row("FBR invoicing fee", money(s.fee));
  if (t === "modern") b.rule("=");
  else rule();
  b.bold(true).size(t !== "minimal").row(L("TOTAL", "کل رقم"), `Rs ${money(s.total)}`).size(false).bold(false);
  if (t === "modern") b.rule("=");
  if (t === "bold") b.bold(true);
  const paid = s.payments.reduce((sum, p) => sum + p.amount, 0);
  for (const p of s.payments) b.row(p.method, money(p.amount));
  if (paid < s.total) b.bold(true).row(L("Balance due", "باقی رقم"), money(s.total - paid)).bold(t === "bold");
  else if (paid > s.total) b.row(L("Change", "واپسی"), money(paid - s.total));
  b.bold(false);

  // ---- FBR e-invoice block (Settings -> FBR Digital Invoicing) ----
  if (s.fbr?.enabled) {
    rule();
    b.align("center").bold(true).line("FBR Digital Invoice").bold(false);
    b.line(`Invoice #: FBR-${orderNo}-${new Date().getFullYear()}`);
    b.line(`NTN: ${s.fbr.ntn || "-"}`).line(`STRN: ${s.fbr.strn || "-"}`).line(`POS ID: ${s.fbr.posId || "-"}`);
    b.line("Verifiable via FBR Tax Asaan app").align("left");
  }

  if (s.footer) {
    if (t === "minimal") b.line();
    else rule();
    b.align("center").line(s.footer);
  }
  return b.cut().bytes;
}

/** Sends the slip/invoice to the matching printer role. Throws a readable Error when it can't. */
export async function printSale(action: Exclude<SaveAction, "save">, s: SaleSnapshot, orderNo: string | number, label?: string) {
  if (!hasTauri()) throw new Error("printing works in the desktop app only");
  if (s.urdu || action === "kitchen" || hasUrdu(JSON.stringify(s))) await ensureUrduFont(); // canvas needs the font loaded before it draws
  if (action === "kitchen") await printToRole("kitchen", buildKitchenSlip(s, orderNo, label));
  else await printToRole("receipt", buildInvoice(s, orderNo));
}

// ---------------------------------------------------------------------------------------------------------------------
// Clock-out slip: the same figures as the "Clock out" popup, on the receipt printer.

export type ShiftSlip = {
  restaurantName: string;
  paper: string;
  employeeName: string;
  clockInAt: string; // ISO
  clockOutAt: string; // ISO
  durationText: string; // "8h 05m"
  orders: number;
  salesAmount: number;
  cash: number;
  otherTotal: number;
  other: { method: string; amount: number }[];
  unpaid: number;
  expenses: number;
};

const slipMoney = (n: number) => `Rs ${Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const slipTime = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

export function buildShiftSlip(s: ShiftSlip): number[] {
  const b = new Buf(colsFor(s.paper), dotsFor(s.paper));
  b.align("center");
  if (s.restaurantName) {
    b.bold(true);
    for (const l of wrap(s.restaurantName, b.cols)) b.line(l);
    b.bold(false);
  }
  b.bold(true).size(true).line("CLOCK OUT").size(false).bold(false);
  b.line(s.employeeName || "");
  b.align("left").rule();
  b.row("Clock in", slipTime(s.clockInAt));
  b.row("Clock out", slipTime(s.clockOutAt));
  b.bold(true).row("Duration", s.durationText).bold(false);
  b.rule();
  b.row("Total sales", `${s.orders} order${s.orders === 1 ? "" : "s"}`);
  b.bold(true).row("Total sale amount", slipMoney(s.salesAmount)).bold(false);
  b.row("Cash", slipMoney(s.cash));
  b.row("Other accounts", slipMoney(s.otherTotal));
  for (const o of s.other) b.row(`  ${o.method}`, slipMoney(o.amount));
  if (s.unpaid > 0) b.row("Still unpaid", slipMoney(s.unpaid));
  b.row("Expenses", slipMoney(s.expenses));
  b.rule();
  b.align("center").line(`Printed ${new Date().toLocaleString()}`);
  b.align("left").line().line("Signature: ______________________");
  return b.cut().bytes;
}

/** Prints the clock-out summary on the receipt printer. Throws a readable Error when it can't. */
export async function printShiftSlip(s: ShiftSlip) {
  if (!hasTauri()) throw new Error("printing works in the desktop app only");
  await printToRole("receipt", buildShiftSlip(s));
}
