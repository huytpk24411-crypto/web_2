import { addCalendarDays, mondayOfWeek, shiftOpening, vietnamDateKey } from './shift-calendar';

describe('Vietnam shift calendar dates', () => {
  it('keeps Sunday and Monday on the correct Vietnam week across UTC midnight', () => {
    expect(mondayOfWeek(vietnamDateKey(Date.parse('2026-11-15T16:59:59Z')))).toBe('2026-11-09');
    expect(mondayOfWeek(vietnamDateKey(Date.parse('2026-11-15T17:00:00Z')))).toBe('2026-11-16');
  });
  it('navigates weeks across month and year boundaries', () => {
    expect(addCalendarDays('2026-12-28', 6)).toBe('2027-01-03');
    expect(addCalendarDays('2026-12-28', 7)).toBe('2027-01-04');
    expect(addCalendarDays('2026-11-02', -7)).toBe('2026-10-26');
    expect(mondayOfWeek('2027-01-03')).toBe('2026-12-28');
  });
  it('formats opening timestamps in Vietnam regardless of the source offset', () => {
    expect(shiftOpening('2026-11-16T00:00:00Z')).toEqual({ time: '07:00', date: '16/11' });
    expect(shiftOpening('2026-11-16T13:00:00+07:00')).toEqual({ time: '13:00', date: '16/11' });
    expect(shiftOpening('')).toBeNull();
  });
});
