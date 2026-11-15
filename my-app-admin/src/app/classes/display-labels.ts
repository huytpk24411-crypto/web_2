import { ApiPolicyLevel } from './PayrollApi';

export const ROOM_TYPE_LABELS: Readonly<Record<string, string>> = {
  PHONG_TRO: 'Phòng trọ',
  CAN_HO_MINI: 'Căn hộ mini',
  STUDIO: 'Studio',
  DUPLEX: 'Duplex',
  CAN_HO: 'Căn hộ',
  KTX: 'Ký túc xá',
};
export function roomTypeLabel(value: string | null | undefined): string {
  return value ? ROOM_TYPE_LABELS[value] || value : 'Chưa phân loại';
}
export function policyTypeLabel(value: string): string {
  return (
    (
      { GIU_CHO: 'Tiền giữ chỗ', HOA_HONG: 'Hoa hồng', PHAT_TRE: 'Phạt đi trễ' } as Record<
        string,
        string
      >
    )[value] || value
  );
}
/** P6 deactivation writes active:false; older records omit active. */
export function catalogIsActive(record: { active?: boolean }): boolean {
  return record.active !== false;
}
export function policyLevelLabel(
  level: Pick<ApiPolicyLevel, 'from' | 'to' | 'amount' | 'rateBps'>,
  type: string,
): string {
  const number = (value: number) => value.toLocaleString('vi-VN');
  const unit = type === 'PHAT_TRE' ? 'phút' : 'đ';
  const range =
    level.to == null
      ? `Từ ${number(level.from)} ${unit} trở lên`
      : `Từ ${number(level.from)}${unit === 'đ' ? ' đ' : ''} đến dưới ${number(level.to)} ${unit}`;
  const value =
    level.rateBps != null
      ? number(level.rateBps / 100) + '%'
      : level.amount != null
        ? number(level.amount) + ' đ'
        : '';
  return range + (value ? ': ' + value : '');
}
