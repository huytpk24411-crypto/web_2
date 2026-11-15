const DAY = 24 * 60 * 60 * 1000;
const VIETNAM_OFFSET = 7 * 60 * 60 * 1000;

/** Calendar dates are interpreted in Vietnam, independently of the device timezone. */
export function vietnamDateKey(now: number): string {
  return new Date(now + VIETNAM_OFFSET).toISOString().slice(0, 10);
}

export function addCalendarDays(date: string, days: number): string {
  return new Date(Date.parse(date + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10);
}

export function mondayOfWeek(date: string): string {
  const weekday = new Date(date + 'T00:00:00Z').getUTCDay();
  return addCalendarDays(date, -((weekday + 6) % 7));
}

export function shortCalendarDate(date: string): string {
  return date.slice(8, 10) + '/' + date.slice(5, 7);
}

export function shiftOpening(startsAt: string): { time: string; date: string } | null {
  const instant = Date.parse(startsAt);
  if (!Number.isFinite(instant)) return null;
  const local = new Date(instant + VIETNAM_OFFSET).toISOString();
  return { time: local.slice(11, 16), date: shortCalendarDate(local) };
}
