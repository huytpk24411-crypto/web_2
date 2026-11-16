const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

function readGroup(value: number, full: boolean): string {
  const hundreds = Math.floor(value / 100);
  const tens = Math.floor((value % 100) / 10);
  const units = value % 10;
  const words: string[] = [];
  if (hundreds || full) words.push(DIGITS[hundreds], 'trăm');
  if (tens > 1) words.push(DIGITS[tens], 'mươi');
  else if (tens === 1) words.push('mười');
  else if (units && (hundreds || full)) words.push('lẻ');
  if (units)
    words.push(units === 5 && tens ? 'lăm' : units === 1 && tens > 1 ? 'mốt' : DIGITS[units]);
  return words.join(' ');
}

/** Whole VND only; reject unsafe, negative or fractional amounts rather than misprint money. */
export function vietnameseMoney(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) return '';
  if (value === 0) return 'Không đồng chẵn';
  const scales = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];
  const groups: number[] = [];
  let remaining = value;
  while (remaining) {
    groups.push(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }
  const words: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i]) words.push(readGroup(groups[i], i < groups.length - 1), scales[i]);
  }
  const result = words.filter(Boolean).join(' ');
  return result.charAt(0).toUpperCase() + result.slice(1) + ' đồng chẵn';
}

/** Calendar months, clamped to the last day of the target month; no UTC date conversion. */
export function depositLeaseEnd(start: string, months: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isInteger(months) || months < 1) return '';
  const [year, month, day] = start.split('-').map(Number);
  const initial = new Date(year, month - 1, day);
  if (
    initial.getFullYear() !== year ||
    initial.getMonth() !== month - 1 ||
    initial.getDate() !== day
  )
    return '';
  const target = new Date(year, month - 1 + months, 1);
  if (Number.isNaN(target.getTime())) return '';
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}
