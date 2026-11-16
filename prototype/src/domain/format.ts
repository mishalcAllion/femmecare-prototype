// Formatting and calendar helpers. All dates are shown and grouped in
// Sri Lanka time (UTC+05:30), whatever the viewer's own time zone.

const OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** A Date whose UTC fields read as Colombo local time. */
function lk(iso: string | Date): Date {
  const t = typeof iso === "string" ? Date.parse(iso) : iso.getTime();
  return new Date(t + OFFSET_MS);
}

export function lkr(n: number, opts: { decimals?: boolean; prefix?: boolean } = {}): string {
  const { decimals = true, prefix = true } = opts;
  const s = (Math.round(n * 100) / 100).toLocaleString("en-US", {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  });
  return prefix ? `LKR ${s}` : s;
}

/** Short money for KPI tiles and chart axes: LKR 1.42m, LKR 71.3k; smaller amounts in full. */
export function lkrShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `LKR ${(n / 1_000_000).toFixed(2)}m`;
  if (a >= 10_000) return `LKR ${(n / 1000).toFixed(1)}k`;
  return lkr(n);
}

export function num(n: number): string {
  return n.toLocaleString("en-US");
}

export function date(iso?: string): string {
  if (!iso) return "";
  const d = lk(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function dateShort(iso?: string): string {
  if (!iso) return "";
  const d = lk(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function time(iso?: string): string {
  if (!iso) return "";
  const d = lk(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function dateTime(iso?: string): string {
  if (!iso) return "";
  return `${date(iso)}, ${time(iso)}`;
}

export function weekday(iso: string): string {
  return DAYS[lk(iso).getUTCDay()];
}

/** "2027-02" */
export function monthKey(iso: string): string {
  return lk(iso).toISOString().slice(0, 7);
}

/** "2027-02-14" */
export function dayKey(iso: string): string {
  return lk(iso).toISOString().slice(0, 10);
}

export function monthLabel(key: string, long = true): string {
  const [y, m] = key.split("-").map(Number);
  return `${(long ? MONTHS_LONG : MONTHS)[m - 1]} ${y}`;
}

export function prevMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export function nextMonthKey(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** ISO instant for a Colombo local date and time, e.g. lkIso("2027-03-02", "09:00"). */
export function lkIso(day: string, hhmm = "00:00"): string {
  return new Date(`${day}T${hhmm}:00+05:30`).toISOString();
}

export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 86_400_000).toISOString();
}

export function addMinutes(iso: string, mins: number): string {
  return new Date(Date.parse(iso) + mins * 60_000).toISOString();
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.floor((Date.parse(dayKey(toIso)) - Date.parse(dayKey(fromIso))) / 86_400_000);
}

export function lastDayOfMonth(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${key}-${String(last).padStart(2, "0")}`;
}

export function relative(iso: string, nowIso: string): string {
  const diff = Date.parse(nowIso) - Date.parse(iso);
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return date(iso);
}

/** An address with its city, without repeating the city when the address already ends with it. */
export function addressLine(address: string, city?: string): string {
  const a = address.trim();
  const c = (city ?? "").trim();
  if (!c) return a;
  if (!a) return c;
  return a.toLowerCase().endsWith(c.toLowerCase()) ? a : `${a}, ${c}`;
}

export function consultantCode(n?: number): string {
  if (n === undefined) return "Not issued";
  return `FC${String(n).padStart(5, "0")}`;
}

export function maskTail(s: string, show = 4): string {
  if (!s) return "";
  return `${"•".repeat(Math.max(0, s.length - show))}${s.slice(-show)}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${num(n)} ${n === 1 ? one : many}`;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Month an order's sale counts in, applying the cut-off time on the last day. */
export function salesMonth(paidAt: string, cutoff: string): string {
  const m = monthKey(paidAt);
  if (lastDayOfMonth(m) === dayKey(paidAt) && time(paidAt) > cutoff) return nextMonthKey(m);
  return m;
}
