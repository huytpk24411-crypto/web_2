import { Property, PropertySchool } from '../models/domain';
import { SCHOOLS } from './schools';

// Explicit demo grouping authorized by the owner; not a claim of verified building membership.
export const PROPERTIES: Property[] = [
  ['p1', 'The Nestro', 'Đường Thống Nhất, Đông Hòa'],
  ['p-r6', 'CHDV đường số 2', 'Đường số 2, Tân Lập, Đông Hòa'],
  ['p-r7', 'CHDV gần KTX khu B', 'Phượng Hoàng, Đông Hòa'],
  ['p-r8', 'Duplex Tô Hiệu', 'Tô Hiệu, Đông Hòa'],
  ['p2', 'Mona Home', 'Trần Thị Vững, Dĩ An'],
  ['p-r11', 'Duplex làng đại học', 'Vành Đai, Đông Hòa'],
  ['p-r12', 'Duplex Đào Sư Tích', 'Đào Sư Tích, Đông Hòa'],
].map(([id, name, address], index) => {
  // Owner authorized illustrative properties. These are NOT geocoded building addresses.
  const anchor = SCHOOLS[index % 4];
  return {
    id,
    name,
    address,
    lat: anchor.lat + 0.004 + Math.floor(index / 4) * 0.002,
    lng: anchor.lng - 0.005 + (index % 3) * 0.003,
    images: index < 4 ? ['/assets/asset-' + [112, 115, 114, 119][index] + '.jpg'] : [],
    locationStatus: 'demo' as const,
    demo: true,
    locationSource: 'Vị trí minh họa do đồ án tạo; chưa có tọa độ tòa nhà từ MongoDB',
  };
});

// Add only owner-supplied / sourced joins. Empty does not mean the buildings are far away.
export const PROPERTY_SCHOOLS: PropertySchool[] = PROPERTIES.map((p, i) => ({
  propertyId: p.id,
  schoolId: SCHOOLS[i % 4].id,
  source: 'Quan hệ minh họa, chờ dữ liệu MongoDB',
}));
