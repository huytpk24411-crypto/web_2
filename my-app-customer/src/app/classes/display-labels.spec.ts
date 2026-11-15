import {
  ROOM_TYPE_LABELS,
  roomTypeLabel,
  policyTypeLabel,
  policyLevelLabel,
  catalogIsActive,
} from './display-labels';
import { RoomTypePipe } from '../shared/display-pipes';

describe('Shared display labels', () => {
  it('labels all room codes without changing their stored values or existing labels', () => {
    const codes = ['PHONG_TRO', 'CAN_HO_MINI', 'STUDIO', 'DUPLEX', 'CAN_HO', 'KTX'];
    expect(codes.map(roomTypeLabel)).toEqual([
      'Phòng trọ',
      'Căn hộ mini',
      'Studio',
      'Duplex',
      'Căn hộ',
      'Ký túc xá',
    ]);
    expect(Object.keys(ROOM_TYPE_LABELS)).toEqual(codes);
    const pipe = new RoomTypePipe();
    expect(pipe.transform('CAN_HO')).toBe('Căn hộ');
    expect(pipe.transform('Căn hộ')).toBe('Căn hộ');
    expect(pipe.transform(undefined)).toBe('Chưa phân loại');
    expect(codes[0]).toBe('PHONG_TRO');
  });
  it('labels policy types and formats currency/minute ranges with exclusive upper bounds', () => {
    expect(['GIU_CHO', 'HOA_HONG', 'PHAT_TRE'].map(policyTypeLabel)).toEqual([
      'Tiền giữ chỗ',
      'Hoa hồng',
      'Phạt đi trễ',
    ]);
    expect(
      policyLevelLabel({ from: 10000000, to: 15000000, rateBps: 3000, amount: null }, 'HOA_HONG'),
    ).toBe('Từ 10.000.000 đ đến dưới 15.000.000 đ: 30%');
    expect(policyLevelLabel({ from: 1, to: 16, rateBps: null, amount: 20000 }, 'PHAT_TRE')).toBe(
      'Từ 1 đến dưới 16 phút: 20.000 đ',
    );
    expect(policyLevelLabel({ from: 0, to: null, rateBps: null, amount: null }, 'GIU_CHO')).toBe(
      'Từ 0 đ trở lên',
    );
    expect(
      policyLevelLabel({ from: 31, to: null, rateBps: null, amount: 100000 }, 'PHAT_TRE'),
    ).toBe('Từ 31 phút trở lên: 100.000 đ');
  });
  it('uses the P6 active flag and treats missing flags as active', () => {
    expect(catalogIsActive({})).toBe(true);
    expect(catalogIsActive({ active: true })).toBe(true);
    expect(catalogIsActive({ active: false })).toBe(false);
  });
});
