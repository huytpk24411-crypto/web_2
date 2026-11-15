import { parsePayrollNotes } from './payroll-service';

describe('Employee payroll note presentation', () => {
  it('turns JSON reasons into labelled text and exposes no internal IDs', () => {
    const result = parsePayrollNotes(
      JSON.stringify({
        reason: 'Đi trễ',
        bonusReason: 'Hoàn thành trách nhiệm',
        lateness: [
          {
            attendanceId: 'attendance-private',
            policyLevelId: 'level-private',
            lateMinutes: 15,
            amount: 50000,
          },
        ],
      }),
    );
    expect(result.lines).toEqual([
      'Lý do khấu trừ: Đi trễ',
      'Lý do thưởng: Hoàn thành trách nhiệm',
    ]);
    expect(result.lateness).toEqual([{ date: undefined, lateMinutes: 15, amount: 50000 }]);
    expect(JSON.stringify(result)).not.toContain('attendance-private');
    expect(JSON.stringify(result)).not.toContain('level-private');
  });
  it('handles JSON followed by several P4 lines without duplicating API lateness', () => {
    const notes =
      JSON.stringify({ reason: 'Đi trễ', bonusReason: 'Không thưởng', lateness: [] }) +
      '\n' +
      '2026-11-04: trễ 10 phút; attendance attendance-a; policy-a: 10000 VND\n' +
      '2026-11-05: trễ 25 phút; attendance attendance-b; policy-b: 70000 VND';
    const result = parsePayrollNotes(notes, [
      { attendanceId: 'attendance-a', lateMinutes: 10, amount: 10000 },
      { attendanceId: 'attendance-b', lateMinutes: 25, amount: 70000 },
    ]);
    expect(result.lateness).toEqual([
      { date: '2026-11-04', lateMinutes: 10, amount: 10000 },
      { date: '2026-11-05', lateMinutes: 25, amount: 70000 },
    ]);
    expect(result.lines).toHaveLength(2);
    expect(JSON.stringify(result)).not.toContain('policy-');
  });
  it('accepts multiline JSON and braces or escaped quotes in a business reason', () => {
    const reason = 'Đối soát "tháng {11}"';
    const notes =
      JSON.stringify({ reason, lateness: [] }, null, 2) +
      '\n2026-11-05: trễ 5 phút; attendance a; level: 0 VND';
    const result = parsePayrollNotes(notes);
    expect(result.lines).toEqual(['Lý do khấu trừ: ' + reason]);
    expect(result.lateness).toEqual([{ date: '2026-11-05', lateMinutes: 5, amount: 0 }]);
  });
  it('preserves ordinary text as separate lines and leaves empty notes empty', () => {
    expect(parsePayrollNotes('Đã đối soát\nĐã kiểm tra').lines).toEqual([
      'Đã đối soát',
      'Đã kiểm tra',
    ]);
    expect(parsePayrollNotes('')).toEqual({ lines: [], lateness: [] });
  });
  it('does not expose malformed JSON or technical attendance lines', () => {
    const result = parsePayrollNotes(
      '{"lateness": [invalid]}\nattendance internal-id; policyLevelId: secret',
    );
    expect(result).toEqual({ lines: [], lateness: [] });
  });
});
