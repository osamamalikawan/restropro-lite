/** A tiny, dependency-free PDF writer for report tables (landscape A4, Helvetica). Used by Accounts -> PDF.
 *  Text is Latin only (the built-in PDF fonts have no Urdu); anything else prints as "?". */

type RGB = [number, number, number];
export type PdfColumn = {
  header: string;
  width: number; // points; all columns together should be about 760
  align?: "left" | "right";
  /** optional text colour for a cell */
  color?: (cell: string, row: string[]) => RGB | undefined;
};
export type PdfTable = {
  title: string;
  lines?: string[]; // grey lines under the title (period, filters, generated-at)
  summary?: { label: string; value: string; color?: RGB }[]; // boxes shown on the first page
  columns: PdfColumn[];
  rows: string[][];
  note?: string; // printed after the last row
};

// Helvetica glyph widths (1/1000 em) for ASCII 32..126
const W = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const PAGE_W = 842;
const PAGE_H = 595;
const M = 40;

function clean(s: string): string {
  return String(s ?? "")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u00B7|\u2022/g, "-")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\x20-\x7E]/g, "?");
}
const esc = (s: string) => clean(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const num = (n: number) => (Math.round(n * 100) / 100).toString();
const rg = (c: RGB) => `${num(c[0])} ${num(c[1])} ${num(c[2])}`;

function width(s: string, size: number, bold = false): number {
  let w = 0;
  for (const ch of clean(s)) w += W[ch.charCodeAt(0) - 32] ?? 556;
  return (w * size * (bold ? 1.06 : 1)) / 1000;
}

/** Wraps `s` into at most `maxLines` lines no wider than `maxW`; the last line ends with "..." if text was cut. */
function wrap(s: string, size: number, maxW: number, maxLines: number): string[] {
  const words = clean(s).split(" ").filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  const fit = (t: string) => {
    if (width(t, size) <= maxW) return t;
    let x = t;
    while (x.length > 1 && width(x + "...", size) > maxW) x = x.slice(0, -1);
    return x + "...";
  };
  for (let i = 0; i < words.length; i++) {
    const next = cur ? `${cur} ${words[i]}` : words[i];
    if (width(next, size) <= maxW) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = words[i];
      if (lines.length === maxLines - 1) {
        cur = fit([cur, ...words.slice(i + 1)].join(" "));
        break;
      }
    }
  }
  if (cur) lines.push(fit(cur));
  return lines.length ? lines.slice(0, maxLines) : [""];
}

export function buildTablePdf(t: PdfTable): Uint8Array {
  const FS = 8.5; // body text
  const LH = 11; // line height
  const pages: string[] = [];
  let ops = "";
  let y = 0;

  const text = (x: number, yy: number, s: string, size: number, opt: { bold?: boolean; color?: RGB; right?: boolean } = {}) => {
    const w = opt.right ? width(s, size, opt.bold) : 0;
    ops += `BT /${opt.bold ? "F2" : "F1"} ${size} Tf ${rg(opt.color ?? [0.1, 0.1, 0.1])} rg ${num(x - w)} ${num(yy)} Td (${esc(s)}) Tj ET\n`;
  };
  const rect = (x: number, yy: number, w: number, h: number, fill: RGB) => {
    ops += `${rg(fill)} rg ${num(x)} ${num(yy)} ${num(w)} ${num(h)} re f\n`;
  };
  const hline = (yy: number, c: RGB = [0.85, 0.85, 0.85]) => {
    ops += `${rg(c)} RG 0.5 w ${M} ${num(yy)} m ${PAGE_W - M} ${num(yy)} l S\n`;
  };

  const tableHeader = () => {
    rect(M, y - 18, PAGE_W - 2 * M, 18, [0.93, 0.93, 0.93]);
    let x = M;
    for (const c of t.columns) {
      if (c.align === "right") text(x + c.width - 6, y - 12.5, c.header, 8, { bold: true, right: true, color: [0.3, 0.3, 0.3] });
      else text(x + 6, y - 12.5, c.header, 8, { bold: true, color: [0.3, 0.3, 0.3] });
      x += c.width;
    }
    y -= 18;
  };

  const startPage = (first: boolean) => {
    ops = "";
    rect(0, PAGE_H - 8, PAGE_W, 8, [0.85, 0.28, 0.12]); // brand stripe
    y = PAGE_H - M - 6;
    if (first) {
      text(M, y - 14, t.title, 18, { bold: true });
      y -= 22;
      for (const l of t.lines ?? []) {
        text(M, y - 12, l, 9, { color: [0.4, 0.4, 0.4] });
        y -= 13;
      }
      y -= 8;
      if (t.summary?.length) {
        const bw = Math.min(190, (PAGE_W - 2 * M - 12 * (t.summary.length - 1)) / t.summary.length);
        t.summary.forEach((s, i) => {
          const x = M + i * (bw + 12);
          rect(x, y - 38, bw, 38, [0.97, 0.97, 0.97]);
          text(x + 10, y - 14, s.label.toUpperCase(), 7, { bold: true, color: [0.5, 0.5, 0.5] });
          text(x + 10, y - 31, s.value, 13, { bold: true, color: s.color });
        });
        y -= 52;
      }
    } else {
      text(M, y - 10, t.title, 10, { bold: true, color: [0.4, 0.4, 0.4] });
      y -= 22;
    }
    tableHeader();
  };
  const endPage = () => pages.push(ops);

  startPage(true);
  for (const row of t.rows) {
    const cells = t.columns.map((c, i) => wrap(row[i] ?? "", FS, c.width - 12, 2));
    const nLines = Math.max(...cells.map((c) => c.length));
    const h = nLines * LH + 7;
    if (y - h < M + 14) {
      endPage();
      startPage(false);
    }
    let x = M;
    t.columns.forEach((c, i) => {
      const color = c.color?.(row[i] ?? "", row);
      cells[i].forEach((ln, k) => {
        const ty = y - 11 - k * LH;
        if (c.align === "right") text(x + c.width - 6, ty, ln, FS, { right: true, color });
        else text(x + 6, ty, ln, FS, { color });
      });
      x += c.width;
    });
    y -= h;
    hline(y);
  }
  if (!t.rows.length) text(M + 6, y - 16, "No entries in this range.", 9, { color: [0.5, 0.5, 0.5] });
  if (t.note) text(M, Math.max(y - 22, M), t.note, 8.5, { color: [0.4, 0.4, 0.4] });
  endPage();

  // page numbers, then assemble the file
  const total = pages.length;
  const content = pages.map((p, i) => `${p}BT /F1 8 Tf 0.5 0.5 0.5 rg ${PAGE_W - M - 60} ${M - 18} Td (Page ${i + 1} of ${total}) Tj ET\n`);

  const objs: string[] = [];
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  const kids = content.map((_, i) => `${5 + i * 2} 0 R`).join(" ");
  objs[2] = `<< /Type /Pages /Kids [${kids}] /Count ${total} >>`;
  objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objs[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  content.forEach((c, i) => {
    const pageNo = 5 + i * 2;
    objs[pageNo] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageNo + 1} 0 R >>`;
    objs[pageNo + 1] = `<< /Length ${c.length} >>\nstream\n${c}endstream`;
  });

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = out.length;
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

  // everything above is plain ASCII, so one char = one byte
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}

export function downloadPdf(bytes: Uint8Array, filename: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
