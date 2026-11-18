import ExcelJS from "exceljs";

/**
 * Reads the first sheet of an .xlsx or .csv file into rows of plain strings,
 * keyed by lower-cased header. Dates become YYYY-MM-DD, times become HH:MM.
 */
export async function readSheet(file: { name: string; arrayBuffer(): Promise<ArrayBuffer> }) {
  const buf = await file.arrayBuffer();
  const name = file.name.toLowerCase();
  let grid: string[][];
  if (name.endsWith(".csv")) {
    grid = parseCsv(new TextDecoder().decode(buf));
  } else if (name.endsWith(".xlsx")) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    if (!ws) throw new Error("The spreadsheet has no sheets.");
    grid = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      for (let c = 1; c <= ws.columnCount; c++) cells.push(cellToString(row.getCell(c).value));
      grid.push(cells);
    });
  } else {
    throw new Error("Please upload an .xlsx or .csv file.");
  }
  grid = grid.filter((r) => r.some((c) => c.trim() !== ""));
  if (grid.length === 0) throw new Error("The spreadsheet is empty.");
  const headers = grid[0].map((h) => h.trim().toLowerCase());
  return grid.slice(1).map((r, i) => {
    const obj: Record<string, string> = { __row: String(i + 2) };
    headers.forEach((h, j) => {
      if (h) obj[h] = (r[j] ?? "").trim();
    });
    return obj;
  });
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function cellToString(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (v instanceof Date) {
    // Excel stores times as dates on 1899-12-30; dates have no time part.
    if (v.getUTCFullYear() <= 1900) return `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}`;
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  }
  if (typeof v === "object") {
    if ("result" in v && v.result != null) return cellToString(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return String(v.text);
    return "";
  }
  return String(v);
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Accepts 2026-11-22, 11/22/2026, 11/22/26. Returns YYYY-MM-DD or null. */
export function parseDate(s: string): string | null {
  s = s.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return `${y}-${pad(+m[1])}-${pad(+m[2])}`;
  }
  return null;
}

/** Accepts 7:00, 07:00, 7am, 7:30 PM, 13:15, and Excel fractions like 0.2917. Returns HH:MM or null. */
export function parseTime(s: string): string | null {
  s = s.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  if (/^0?\.\d+$/.test(s)) {
    const mins = Math.round(parseFloat(s) * 24 * 60);
    return `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`;
  }
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?(am|pm|a|p)?$/);
  if (!m) return null;
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  const ap = m[3];
  if (ap?.startsWith("p") && h < 12) h += 12;
  if (ap?.startsWith("a") && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

/** Picks the first non-empty value among several possible header names. */
export function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) if (row[k]) return row[k];
  return "";
}
