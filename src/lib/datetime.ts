// ============================================================
// HireSphere AI — Date/time helpers
// Date-only values (attendance dates, leave ranges, joining
// dates) are always anchored at UTC midnight for consistency.
// ============================================================

/** Strip time: today (or any date) at UTC midnight. */
export function utcDateOnly(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Parse a client-supplied date. Accepts `YYYY-MM-DD` (anchored at
 * UTC midnight) or any string parseable by `new Date(...)`.
 */
export function parseFlexibleDate(value: string): Date {
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T00:00:00.000Z`);
  return new Date(v);
}

export function isValidDateString(value: string): boolean {
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const date = new Date(`${v}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === v;
  }
  return !Number.isNaN(new Date(v).getTime());
}

/** Parse `YYYY-MM` into [monthStart, nextMonthStart) in UTC. Throws on bad input. */
export function monthRange(month: string): { start: Date; end: Date } {
  const m = /^(\d{4})-(\d{2})$/.exec(month.trim());
  if (!m) throw new Error(`Invalid month: ${month}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) throw new Error(`Invalid month: ${month}`);
  return { start: new Date(Date.UTC(y, mo - 1, 1)), end: new Date(Date.UTC(y, mo, 1)) };
}

/** Format a Date as `YYYY-MM-DD` (UTC). */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Combine `YYYY-MM-DD` + `HH:mm` into a UTC Date. */
export function combineDateTime(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}:00.000Z`);
}

/** Whole-day inclusive count between two UTC-midnight dates. */
export function inclusiveDays(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}
