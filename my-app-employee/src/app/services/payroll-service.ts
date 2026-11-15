import { Injectable, inject } from '@angular/core';
import { PayrollSlip } from '../classes/Payroll';
import { PayrollAPIService } from './payroll-apiservice';
@Injectable({ providedIn: 'root' })
export class PayrollService {
  api = inject(PayrollAPIService);
  private record(slip: PayrollSlip) {
    return Object.values(this.api.state().slips)
      .flat()
      .find((s) => s.id === slip.id);
  }
  get slips(): PayrollSlip[] {
    return Object.values(this.api.state().slips)
      .flat()
      .map((s) => ({
        id: s.id,
        employeeId: s.employeeId,
        periodId: s.periodCode,
        base: s.baseSalary,
        allowance: 0,
        brokerageRevenue: s.totalRevenue,
        commissionRate: (s.commission?.rateBps || 0) / 10000,
        commissionAmount: s.commissionAmount,
        status: s.status,
        paidAt: s.paidAt,
        bonus: s.totalBonus,
        deduction: s.totalDeductions,
      }));
  }
  commission(s: PayrollSlip) {
    return this.record(s)?.commissionAmount ?? 0;
  }
  net(s: PayrollSlip) {
    return this.record(s)?.netPay ?? 0;
  }
  lateEntries(s: PayrollSlip) {
    const record = this.record(s);
    return parsePayrollNotes(record?.adjustment.notes || '', record?.lateness || []).lateness;
  }
  notes(s: PayrollSlip) {
    const record = this.record(s);
    return parsePayrollNotes(record?.adjustment.notes || '', record?.lateness || []).lines;
  }
  transactions(s: PayrollSlip) {
    return this.record(s)?.transactions || [];
  }
}

interface DisplayLateEntry {
  date?: string;
  lateMinutes: number;
  amount: number;
}

// The payload can contain a JSON object followed by P4 attendance lines.
// Keep technical IDs only for deduplication; never return them to the template.
export function parsePayrollNotes(
  raw: string,
  entries: readonly { attendanceId: string; lateMinutes: number; amount: number }[] = [],
): { lines: string[]; lateness: DisplayLateEntry[] } {
  const text = raw.trim();
  let tail = text;
  let data: Record<string, unknown> | null = null;
  if (text.startsWith('{')) {
    let depth = 0,
      quoted = false,
      escaped = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === '{' || char === '[') depth++;
      else if (char === '}' || char === ']') {
        depth--;
        if (!depth) {
          try {
            const parsed: unknown = JSON.parse(text.slice(0, i + 1));
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              data = parsed as Record<string, unknown>;
              tail = text.slice(i + 1).trim();
            }
          } catch {
            /* Leave malformed metadata out of the displayed text below. */
          }
          break;
        }
      }
    }
  }
  const lines: string[] = [];
  if (typeof data?.['reason'] === 'string' && data['reason'].trim())
    lines.push('Lý do khấu trừ: ' + data['reason'].trim());
  if (typeof data?.['bonusReason'] === 'string' && data['bonusReason'].trim())
    lines.push('Lý do thưởng: ' + data['bonusReason'].trim());
  const rows = new Map<string, DisplayLateEntry>();
  function add(value: unknown, replace = false) {
    if (!value || typeof value !== 'object') return;
    const row = value as Record<string, unknown>;
    const minutes = row['lateMinutes'],
      amount = row['amount'];
    if (
      typeof minutes !== 'number' ||
      !Number.isSafeInteger(minutes) ||
      minutes < 0 ||
      typeof amount !== 'number' ||
      !Number.isSafeInteger(amount) ||
      amount < 0
    )
      return;
    const date =
      typeof row['date'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row['date'])
        ? row['date']
        : undefined;
    const key =
      typeof row['attendanceId'] === 'string' && row['attendanceId']
        ? row['attendanceId']
        : `${date || ''}:${minutes}:${amount}`;
    const previous = rows.get(key);
    if (!previous || replace)
      rows.set(key, { date: date || previous?.date, lateMinutes: minutes, amount });
    else if (date && !previous.date) rows.set(key, { ...previous, date });
  }
  if (Array.isArray(data?.['lateness'])) data['lateness'].forEach((value) => add(value));
  entries.forEach((value) => add(value, true));
  for (const value of tail.split(/\r?\n/)) {
    const line = value.trim();
    if (!line) continue;
    const late = /^(\d{4}-\d{2}-\d{2}):\s*trễ (\d+) phút(?:;|$)/i.exec(line);
    if (late) {
      const amount = /;\s*[^;]+:\s*(\d+)\s*(?:VND|đ)\s*$/i.exec(line);
      const attendance = /;\s*attendance\s+([^;\s]+)/i.exec(line);
      if (amount)
        add({
          date: late[1],
          lateMinutes: Number(late[2]),
          amount: Number(amount[1]),
          attendanceId: attendance?.[1],
        });
      continue;
    }
    if (
      !['{', '}', '[', ']', '"'].some((char) => line.startsWith(char)) &&
      !/\b(?:attendance|policyLevelId)\b/i.test(line)
    )
      lines.push(line);
  }
  return { lines, lateness: [...rows.values()] };
}
