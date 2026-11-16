import { depositLeaseEnd, vietnameseMoney } from './vietnamese-money';

describe('vietnameseMoney', () => {
  it.each([
    [0, 'Không đồng chẵn'],
    [1000000, 'Một triệu đồng chẵn'],
    [1800000, 'Một triệu tám trăm nghìn đồng chẵn'],
    [3000000, 'Ba triệu đồng chẵn'],
    [4300000, 'Bốn triệu ba trăm nghìn đồng chẵn'],
    [12050000, 'Mười hai triệu không trăm năm mươi nghìn đồng chẵn'],
    [1000005, 'Một triệu không trăm lẻ năm đồng chẵn'],
    [21, 'Hai mươi mốt đồng chẵn'],
    [15, 'Mười lăm đồng chẵn'],
    [1000000000, 'Một tỷ đồng chẵn'],
  ])('reads %s VND', (value, expected) => {
    expect(vietnameseMoney(Number(value))).toBe(expected);
  });
  it.each([-1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])(
    'rejects unsupported amount %s',
    (value) => {
      expect(vietnameseMoney(value)).toBe('');
    },
  );
});

describe('depositLeaseEnd', () => {
  it.each([
    ['2026-11-16', 12, '2027-11-16'],
    ['2026-01-31', 1, '2026-02-28'],
    ['2028-01-31', 1, '2028-02-29'],
    ['2026-12-31', 2, '2027-02-28'],
    ['2026-02-31', 1, ''],
    ['', 12, ''],
  ])('adds calendar months to %s', (start, months, expected) => {
    expect(depositLeaseEnd(String(start), Number(months))).toBe(expected);
  });
});
