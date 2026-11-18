/**
 * Reads the schedule layout the Reynolds courses already use:
 *
 *            | Thursday | Friday | … | Wednesday
 *            |  May 1   | May 2  | … |  May 7
 *   (event / player-count rows, ignored)
 *   ---------- Golf Professionals ----------        <- department section
 *   Name  Phone | Here    | Open   | … | Close
 *   ---------- Cart Attendants ----------
 *   Name  Phone | 6:00-2:00 | * | 6:00-EOE | RO …
 *
 * Cell codes: "6:00-2:00" a timed shift, "7:30-EOE" until end of event,
 * "12:00-CL" until close, a word like "Open"/"Close"/"Here" a shift with no
 * set time, and "*", "RO", "Off" or blank for not working.
 */

export type GridShift = {
  name: string;
  section: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  label: string | null;
};

export type GridPerson = { name: string; phone: string | null; section: string };

export type GridResult = {
  shifts: GridShift[];
  people: GridPerson[];
  requestedOff: number;
  errors: string[];
};

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const OFF = new Set(["", "*", "-", "–", "x", "off", "ro", "r/o", "pto", "vac", "vacation"]);
const END_LABELS: Record<string, string> = { eoe: "EOE", cl: "CL", close: "CL", closing: "CL", end: "EOE" };

const pad = (n: number) => String(n).padStart(2, "0");
const isDayName = (s: string) => {
  const k = s.trim().toLowerCase();
  return k.length >= 3 && DAYS.some((d) => k.startsWith(d));
};
const PHONE = /\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}/;

/** True if this grid looks like the names-down, days-across layout. */
export function looksLikeGrid(grid: string[][]): boolean {
  return grid.slice(0, 15).some((r) => r.filter(isDayName).length >= 5);
}

/** "May 1" / "5/1" / "2026-05-01" -> YYYY-MM-DD, picking the year closest to refDate. */
export function parseDayDate(raw: string, refDate: string): string | null {
  const s = raw.trim().toLowerCase();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return s;
  let month: number | undefined;
  let day: number | undefined;
  let year: number | undefined;
  m = s.match(/^([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/);
  if (m && MONTHS.includes(m[1])) {
    month = MONTHS.indexOf(m[1]) + 1;
    day = +m[2];
    year = m[3] ? +m[3] : undefined;
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  if (m) {
    month = +m[1];
    day = +m[2];
    year = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : undefined;
  }
  if (!month || !day || month > 12 || day > 31) return null;
  if (year) return `${year}-${pad(month)}-${pad(day)}`;
  // No year on the sheet. Schedules are posted at most a couple of months ahead,
  // so take the year that puts the date within 10 months back to 2 months ahead.
  const refYear = +refDate.slice(0, 4);
  const ref = Date.parse(refDate);
  const DAY = 86_400_000;
  for (const y of [refYear + 1, refYear, refYear - 1]) {
    const c = `${y}-${pad(month)}-${pad(day)}`;
    const diff = (Date.parse(c) - ref) / DAY;
    if (diff <= 62 && diff > -304) return c;
  }
  return `${refYear}-${pad(month)}-${pad(day)}`;
}

function toMinutes(h: number, m: number) {
  return h * 60 + m;
}

/** Turns a sheet cell into a shift. Returns "off", a shift, or an error string. */
export function parseShiftCell(raw: string): "off" | "requested_off" | { startTime: string | null; endTime: string | null; label: string | null } | { error: string } {
  const s = raw.trim();
  const k = s.toLowerCase();
  if (k === "ro" || k === "r/o") return "requested_off";
  if (OFF.has(k)) return "off";

  const m = k.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?\s*[-–—to]+\s*(.+)$/);
  if (m) {
    let sh = +m[1];
    const sm = m[2] ? +m[2] : 0;
    const sap = m[3];
    if (sh > 23 || sm > 59) return { error: s };
    if (sap) {
      if (sap.startsWith("p") && sh < 12) sh += 12;
      if (sap.startsWith("a") && sh === 12) sh = 0;
    } else if (sh >= 1 && sh <= 4) {
      sh += 12; // nobody starts at 2 AM; "1:00" means 1 PM
    }
    const startTime = `${pad(sh)}:${pad(sm)}`;

    const endRaw = m[4].trim();
    const endLabel = END_LABELS[endRaw.replace(/[^a-z]/g, "")];
    if (endLabel) return { startTime, endTime: null, label: endLabel };

    const e = endRaw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/);
    if (!e) return { error: s };
    let eh = +e[1];
    const em = e[2] ? +e[2] : 0;
    const eap = e[3];
    if (eh > 23 || em > 59) return { error: s };
    if (eap) {
      if (eap.startsWith("p") && eh < 12) eh += 12;
      if (eap.startsWith("a") && eh === 12) eh = 0;
    } else if (eh < 12 && toMinutes(eh, em) <= toMinutes(sh, sm)) {
      eh += 12; // "6:00-2:00" ends at 2 PM
    }
    return { startTime, endTime: `${pad(eh % 24)}:${pad(em)}`, label: null };
  }

  // A word like "Open", "Close", "Here", "Mid": a shift with no set time.
  if (/^[a-z][a-z\s/&'-]{0,24}$/i.test(s)) return { startTime: null, endTime: null, label: s };
  return { error: s };
}

function cleanName(raw: string): string {
  return raw
    .replace(PHONE, "")
    .replace(/\([^)]*\)/g, "") // "(On Call)"
    .replace(/\s+/g, " ")
    .trim();
}

export function parseScheduleGrid(grid: string[][], refDate: string): GridResult {
  const errors: string[] = [];
  const headerIdx = grid.findIndex((r) => r.filter(isDayName).length >= 5);
  if (headerIdx < 0) return { shifts: [], people: [], requestedOff: 0, errors: ["Couldn't find the row with the days of the week."] };

  const dayCols = grid[headerIdx].map((c, i) => (isDayName(c) ? i : -1)).filter((i) => i >= 0);
  const firstDayCol = Math.min(...dayCols);

  // Dates: in the header cell itself ("Thursday May 1") or in the next couple of rows.
  const dates = dayCols.map((col) => {
    for (let r = headerIdx; r <= headerIdx + 2 && r < grid.length; r++) {
      const cell = (grid[r][col] ?? "").trim();
      const withoutDay = cell.replace(/^[a-z]+day,?\s*/i, "");
      const d = parseDayDate(withoutDay, refDate);
      if (d) return d;
    }
    return null;
  });
  if (dates.some((d) => !d)) {
    return { shifts: [], people: [], requestedOff: 0, errors: ["Couldn't read the dates under the days of the week (like “May 1”)."] };
  }

  const shifts: GridShift[] = [];
  const people = new Map<string, GridPerson>();
  let section = "";
  let requestedOff = 0;

  for (let r = headerIdx + 1; r < grid.length; r++) {
    const row = grid[r];
    const nonEmpty = row.map((c) => c.trim()).filter(Boolean);
    if (nonEmpty.length === 0) continue;

    // A section header is a row with one repeated piece of text (merged cells repeat it).
    const distinct = [...new Set(nonEmpty)];
    // (A person's row always has at least their name and a shift, so it has two or more.)
    if (distinct.length === 1 && /[a-z]{3}/i.test(distinct[0]) && typeof parseShiftCell(distinct[0]) === "object" && !PHONE.test(distinct[0])) {
      section = distinct[0];
      continue;
    }
    if (!section) continue; // event and player-count rows above the first section

    const left = row.slice(0, firstDayCol).map((c) => c.trim()).filter(Boolean);
    const nameCell = left.find((c) => /[a-z]/i.test(cleanName(c)));
    if (!nameCell) continue;
    const name = cleanName(nameCell);
    const phone = (left.join(" ").match(PHONE) ?? [null])[0];
    if (!people.has(name.toLowerCase())) people.set(name.toLowerCase(), { name, phone, section });

    dayCols.forEach((col, i) => {
      const parsed = parseShiftCell(row[col] ?? "");
      if (parsed === "off") return;
      if (parsed === "requested_off") {
        requestedOff++;
        return;
      }
      if ("error" in parsed) {
        errors.push(`${name}, ${grid[headerIdx][col].trim()}: can't read “${parsed.error}”.`);
        return;
      }
      shifts.push({ name, section, date: dates[i]!, ...parsed });
    });
  }

  if (!section) errors.push("Couldn't find any department sections (like “Cart Attendants”).");
  return { shifts, people: [...people.values()], requestedOff, errors };
}
