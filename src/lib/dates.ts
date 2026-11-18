/** Reynolds is in Georgia, so "today" is Eastern time. */
export const TIME_ZONE = process.env.APP_TIME_ZONE || "America/New_York";

/** Today's date as YYYY-MM-DD in the course time zone. */
export function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parse(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day, 12));
}

export function addDays(d: string, n: number): string {
  const dt = parse(d);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** Monday of the week containing d. */
export function weekStart(d: string): string {
  const dow = parse(d).getUTCDay(); // 0 = Sun
  return addDays(d, dow === 0 ? -6 : 1 - dow);
}

export function formatDate(d: string, opts: { year?: boolean } = {}): string {
  return parse(d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: opts.year ? "numeric" : undefined,
    timeZone: "UTC",
  });
}

export function formatDateRange(a: string, b: string): string {
  return a === b ? formatDate(a) : `${formatDate(a)} – ${formatDate(b)}`;
}

export function formatTime(t: string | null | undefined): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function formatShiftTime(start: string, end: string | null): string {
  return end ? `${formatTime(start)} – ${formatTime(end)}` : `${formatTime(start)} start`;
}

export function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parse(s).getTime());
}
