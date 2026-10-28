/** Receipt design templates for the Settings → Receipt templates picker.
 *
 *  Each template renders from the SAME data shape (restaurant profile + settings + a sale),
 *  so swapping templates is just swapping which component renders — this is also what actual
 *  POS printing would import later (only the paper-width/monospace framing is preview-only).
 *
 *  FBR integration (Federal Board of Revenue e-invoicing, Pakistan) is not a 5th template —
 *  it's an overlay every template renders when `settings.fbr_enabled` is on: an invoice
 *  number, NTN/STRN, and a verification QR block. Off, the receipt prints without any of it.
 */

export type ReceiptRestaurant = { name: string; address: string | null; phone: string | null };
export type ReceiptSettings = {
  receipt_header: string | null;
  receipt_footer: string | null;
  fbr_enabled: boolean;
  fbr_ntn: string | null;
  fbr_strn: string | null;
  fbr_pos_id: string | null;
};
export type ReceiptLine = { name: string; qty: number; price: number };
export type ReceiptSale = {
  orderNo: string;
  date: string;
  cashier: string;
  orderType: string;
  items: ReceiptLine[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: string;
};

/** Fixed dummy order — deliberately not random so every template renders identically for
 *  side-by-side comparison, and totals actually add up. */
export const DUMMY_SALE: ReceiptSale = {
  orderNo: "1042",
  date: new Date().toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }),
  cashier: "Ali Raza",
  orderType: "Dine-in · Table 4",
  items: [
    { name: "Chicken Tikka Pizza (L)", qty: 1, price: 1450 },
    { name: "Beef Zinger Burger", qty: 2, price: 650 },
    { name: "Garlic Bread", qty: 1, price: 280 },
    { name: "Soft Drink 500ml", qty: 3, price: 120 },
  ],
  subtotal: 3390,
  discount: 100,
  tax: 305,
  total: 3595,
  paymentMethod: "Cash",
};

function money(n: number) {
  return `Rs ${n.toLocaleString()}`;
}

/** Placeholder QR — a deterministic pixel grid, not a real scannable code. Good enough to
 *  show where FBR's verification QR will sit on the printed receipt. */
function QrPlaceholder({ dark = false }: { dark?: boolean }) {
  const cells = Array.from({ length: 49 }, (_, i) => (i * 7) % 11 < 5 || i % 13 === 0);
  return (
    <div
      className="grid shrink-0"
      style={{ gridTemplateColumns: "repeat(7, 1fr)", width: 56, height: 56, gap: 1, background: dark ? "#fff" : "#000", padding: 3 }}
    >
      {cells.map((on, i) => (
        <div key={i} style={{ background: on ? (dark ? "#000" : "#fff") : "transparent" }} />
      ))}
    </div>
  );
}

function FbrBlockClassic({ settings, sale }: { settings: ReceiptSettings; sale: ReceiptSale }) {
  if (!settings.fbr_enabled) return null;
  return (
    <div className="mt-2 pt-2 border-t border-dashed border-black/40 flex items-center gap-2 text-[10px] leading-tight">
      <QrPlaceholder />
      <div className="flex-1">
        <div className="font-bold">FBR Digital Invoice</div>
        <div>Invoice #: FBR-{sale.orderNo}-2026</div>
        <div>NTN: {settings.fbr_ntn || "—"}</div>
        <div>STRN: {settings.fbr_strn || "—"}</div>
        <div>POS ID: {settings.fbr_pos_id || "—"}</div>
        <div className="opacity-70">Verifiable via FBR Tax Asaan app</div>
      </div>
    </div>
  );
}

function ItemsClassic({ sale }: { sale: ReceiptSale }) {
  return (
    <div className="text-[11px] leading-snug">
      {sale.items.map((it, i) => (
        <div key={i} className="flex justify-between gap-2">
          <span>
            {it.qty} × {it.name}
          </span>
          <span className="shrink-0">{money(it.qty * it.price)}</span>
        </div>
      ))}
    </div>
  );
}

/** 1. Classic — plain monospace thermal-printer look. Dashed rules, no color. */
export function ClassicReceipt({ restaurant, settings, sale }: { restaurant: ReceiptRestaurant; settings: ReceiptSettings; sale: ReceiptSale }) {
  return (
    <div className="bg-white text-black font-mono text-[11px] w-[280px] p-4 shadow-lg">
      <div className="text-center">
        <div className="font-bold text-sm">{restaurant.name}</div>
        {restaurant.address && <div>{restaurant.address}</div>}
        {restaurant.phone && <div>{restaurant.phone}</div>}
        {settings.receipt_header && <div className="mt-1">{settings.receipt_header}</div>}
      </div>
      <div className="my-2 border-t border-dashed border-black/50" />
      <div className="flex justify-between">
        <span>Order #{sale.orderNo}</span>
        <span>{sale.date}</span>
      </div>
      <div>{sale.orderType}</div>
      <div>Cashier: {sale.cashier}</div>
      <div className="my-2 border-t border-dashed border-black/50" />
      <ItemsClassic sale={sale} />
      <div className="my-2 border-t border-dashed border-black/50" />
      <div className="flex justify-between">
        <span>Subtotal</span>
        <span>{money(sale.subtotal)}</span>
      </div>
      <div className="flex justify-between">
        <span>Discount</span>
        <span>-{money(sale.discount)}</span>
      </div>
      <div className="flex justify-between">
        <span>Tax</span>
        <span>{money(sale.tax)}</span>
      </div>
      <div className="my-2 border-t border-dashed border-black/50" />
      <div className="flex justify-between font-bold text-sm">
        <span>TOTAL</span>
        <span>{money(sale.total)}</span>
      </div>
      <div className="flex justify-between mt-1">
        <span>Paid via</span>
        <span>{sale.paymentMethod}</span>
      </div>
      <FbrBlockClassic settings={settings} sale={sale} />
      {settings.receipt_footer && <div className="text-center mt-3">{settings.receipt_footer}</div>}
      <div className="text-center mt-2">Thank you, come again!</div>
    </div>
  );
}

/** 2. Modern — sans-serif, a bold header band, a boxed total. */
export function ModernReceipt({ restaurant, settings, sale }: { restaurant: ReceiptRestaurant; settings: ReceiptSettings; sale: ReceiptSale }) {
  return (
    <div className="bg-white text-black w-[280px] shadow-lg overflow-hidden">
      <div className="bg-black text-white px-4 py-3">
        <div className="font-bold text-sm">{restaurant.name}</div>
        <div className="text-[10px] opacity-80">
          {[restaurant.address, restaurant.phone].filter(Boolean).join(" · ")}
        </div>
      </div>
      <div className="p-4 text-[11px]">
        {settings.receipt_header && <div className="mb-2 italic text-ink-mid" style={{ color: "#555" }}>{settings.receipt_header}</div>}
        <div className="flex justify-between text-[10px] uppercase tracking-wide" style={{ color: "#777" }}>
          <span>Order #{sale.orderNo}</span>
          <span>{sale.orderType}</span>
        </div>
        <div className="text-[10px]" style={{ color: "#777" }}>
          {sale.date} · {sale.cashier}
        </div>
        <div className="my-2.5 h-px bg-black/10" />
        {sale.items.map((it, i) => (
          <div key={i} className="flex justify-between py-0.5">
            <span>
              {it.name} <span style={{ color: "#999" }}>×{it.qty}</span>
            </span>
            <span className="font-medium">{money(it.qty * it.price)}</span>
          </div>
        ))}
        <div className="my-2.5 h-px bg-black/10" />
        <div className="flex justify-between" style={{ color: "#555" }}>
          <span>Subtotal</span>
          <span>{money(sale.subtotal)}</span>
        </div>
        <div className="flex justify-between" style={{ color: "#555" }}>
          <span>Discount</span>
          <span>-{money(sale.discount)}</span>
        </div>
        <div className="flex justify-between" style={{ color: "#555" }}>
          <span>Tax</span>
          <span>{money(sale.tax)}</span>
        </div>
        <div className="mt-2.5 rounded-lg bg-black text-white px-3 py-2 flex justify-between items-center">
          <span className="text-[10px] uppercase tracking-wide opacity-80">Total due</span>
          <span className="font-bold">{money(sale.total)}</span>
        </div>
        <div className="mt-2 text-[10px] text-center" style={{ color: "#777" }}>
          Paid via {sale.paymentMethod}
        </div>
        {settings.fbr_enabled && (
          <div className="mt-3 rounded-lg border border-black/10 p-2.5 flex items-center gap-2.5">
            <QrPlaceholder />
            <div className="text-[9.5px] leading-tight" style={{ color: "#555" }}>
              <div className="font-bold text-black">FBR e-Invoice</div>
              <div>#FBR-{sale.orderNo}-2026 · NTN {settings.fbr_ntn || "—"}</div>
              <div>STRN {settings.fbr_strn || "—"} · POS {settings.fbr_pos_id || "—"}</div>
            </div>
          </div>
        )}
        {settings.receipt_footer && (
          <div className="text-center mt-3 text-[10px]" style={{ color: "#777" }}>
            {settings.receipt_footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** 3. Minimal — lots of whitespace, thin hairlines, small caps, no bold blocks. */
export function MinimalReceipt({ restaurant, settings, sale }: { restaurant: ReceiptRestaurant; settings: ReceiptSettings; sale: ReceiptSale }) {
  return (
    <div className="bg-white text-black w-[280px] p-6 shadow-lg text-[11px]" style={{ fontFamily: "Georgia, serif" }}>
      <div className="text-center mb-4">
        <div className="text-[13px] tracking-[0.15em] uppercase">{restaurant.name}</div>
        <div className="text-[9.5px] mt-1" style={{ color: "#888" }}>
          {[restaurant.address, restaurant.phone].filter(Boolean).join(" · ")}
        </div>
      </div>
      <div className="flex justify-between text-[9.5px] uppercase tracking-wide mb-3" style={{ color: "#999" }}>
        <span>#{sale.orderNo}</span>
        <span>{sale.date}</span>
      </div>
      {sale.items.map((it, i) => (
        <div key={i} className="flex justify-between mb-1.5">
          <span>{it.name}</span>
          <span>{money(it.qty * it.price)}</span>
        </div>
      ))}
      <div className="my-3 h-px" style={{ background: "#eee" }} />
      <div className="flex justify-between mb-1" style={{ color: "#888" }}>
        <span>Subtotal</span>
        <span>{money(sale.subtotal)}</span>
      </div>
      <div className="flex justify-between mb-1" style={{ color: "#888" }}>
        <span>Tax</span>
        <span>{money(sale.tax)}</span>
      </div>
      <div className="flex justify-between mt-3 text-[14px]">
        <span>Total</span>
        <span>{money(sale.total)}</span>
      </div>
      <div className="text-center mt-5 text-[9.5px]" style={{ color: "#999" }}>
        {sale.cashier} · {sale.paymentMethod}
      </div>
      {settings.fbr_enabled && (
        <div className="mt-4 pt-3 flex flex-col items-center gap-2" style={{ borderTop: "1px solid #eee" }}>
          <QrPlaceholder />
          <div className="text-[9px] text-center" style={{ color: "#999" }}>
            FBR e-Invoice #{sale.orderNo}-2026<br />
            NTN {settings.fbr_ntn || "—"} · STRN {settings.fbr_strn || "—"}
          </div>
        </div>
      )}
      {settings.receipt_footer && (
        <div className="text-center mt-4 text-[9.5px] italic" style={{ color: "#999" }}>
          {settings.receipt_footer}
        </div>
      )}
    </div>
  );
}

/** 4. Bold — big high-contrast type, a heavy total, made to be legible on a phone photo. */
export function BoldReceipt({ restaurant, settings, sale }: { restaurant: ReceiptRestaurant; settings: ReceiptSettings; sale: ReceiptSale }) {
  return (
    <div className="bg-black text-white w-[280px] shadow-lg">
      <div className="px-4 py-4 text-center" style={{ borderBottom: "3px solid #fff" }}>
        <div className="font-black text-base uppercase tracking-tight">{restaurant.name}</div>
        <div className="text-[10px] opacity-70 mt-0.5">
          {[restaurant.address, restaurant.phone].filter(Boolean).join(" · ")}
        </div>
      </div>
      <div className="p-4 text-[11px]">
        <div className="flex justify-between font-bold mb-2">
          <span>#{sale.orderNo}</span>
          <span className="opacity-70 font-normal">{sale.date}</span>
        </div>
        {sale.items.map((it, i) => (
          <div key={i} className="flex justify-between py-1" style={{ borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
            <span>
              {it.qty}x {it.name}
            </span>
            <span className="font-bold">{money(it.qty * it.price)}</span>
          </div>
        ))}
        <div className="flex justify-between mt-2 opacity-70">
          <span>Subtotal</span>
          <span>{money(sale.subtotal)}</span>
        </div>
        <div className="flex justify-between opacity-70">
          <span>Tax</span>
          <span>{money(sale.tax)}</span>
        </div>
        <div className="mt-3 flex justify-between items-baseline">
          <span className="uppercase text-[11px] tracking-wide">Total</span>
          <span className="font-black text-2xl">{money(sale.total)}</span>
        </div>
        <div className="mt-2 text-[10px] opacity-70 text-center">
          {sale.cashier} · Paid via {sale.paymentMethod}
        </div>
        {settings.fbr_enabled && (
          <div className="mt-4 rounded-lg p-2.5 flex items-center gap-2.5" style={{ background: "rgba(255,255,255,0.08)" }}>
            <QrPlaceholder dark />
            <div className="text-[9.5px] leading-tight opacity-90">
              <div className="font-bold">FBR e-INVOICE</div>
              <div>#{sale.orderNo}-2026 · NTN {settings.fbr_ntn || "—"}</div>
              <div>STRN {settings.fbr_strn || "—"}</div>
            </div>
          </div>
        )}
        {settings.receipt_footer && <div className="text-center mt-4 text-[10px] opacity-60">{settings.receipt_footer}</div>}
      </div>
    </div>
  );
}

export const RECEIPT_TEMPLATES = [
  { id: "classic", name: "Classic", description: "Plain monospace thermal-printer look — dashed rules, no color.", Component: ClassicReceipt },
  { id: "modern", name: "Modern", description: "Sans-serif with a bold header band and a boxed total.", Component: ModernReceipt },
  { id: "minimal", name: "Minimal", description: "Lots of whitespace, thin hairlines, serif type.", Component: MinimalReceipt },
  { id: "bold", name: "Bold", description: "High-contrast black receipt, large legible total.", Component: BoldReceipt },
] as const;

export type ReceiptTemplateId = (typeof RECEIPT_TEMPLATES)[number]["id"];
