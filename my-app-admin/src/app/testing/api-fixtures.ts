import { Account } from '../classes/Account';
import { CatalogRoom } from '../services/room-apiservice';
import { Property, PropertySchool } from '../classes/Property';
import { School } from '../classes/School';
import { MoneyHold, MoneyPayment } from '../classes/Money';
import { RoomTour } from '../classes/RoomTour';
export const API_ACCOUNT: Account = {
  id: 'customer-test',
  username: '0901234567',
  phone: '0901234567',
  name: 'Khách kiểm thử',
  role: 'CUSTOMER',
};
function tour(
  number: number,
  kitchen: number,
  bathroom: number,
  bedroom: number,
  back = 180,
): RoomTour {
  return {
    roomId: `phong-${number}`,
    startScene: 'living',
    pitchLimit: 12,
    scenes: ['living', 'kitchen', 'bathroom', 'bedroom'].map((id) => ({
      id,
      label: id,
      image: `/assets/tours/PHONG_${number}/${id}.webp`,
      initialYaw: 0,
      hotspots:
        id === 'living'
          ? [
              { target: 'kitchen', label: 'Bếp', yaw: kitchen, pitch: -6 },
              { target: 'bathroom', label: 'Phòng tắm', yaw: bathroom, pitch: -6 },
              { target: 'bedroom', label: 'Phòng ngủ', yaw: bedroom, pitch: -6 },
            ]
          : [
              {
                target: 'living',
                label: 'Phòng khách',
                yaw: id === 'kitchen' ? back : 180,
                pitch: -6,
              },
            ],
    })),
  };
}
export const API_TOUR_FIXTURES: Record<string, RoomTour> = Object.fromEntries(
  [
    tour(46, -65, -155, 125),
    tour(47, -65, -155, 70),
    tour(48, -120, 180, 125),
    tour(49, -65, 180, 125, 70),
    tour(50, -120, 155, 125),
  ].map((value) => [value.roomId, value]),
);
export const API_ROOMS: CatalogRoom[] = [46, 47, 48, 49, 50, 45, 44].map((number) => ({
  id: `phong-${number}`,
  code: `PHONG_${number}`,
  name: `Phòng kiểm thử ${number}`,
  number: String(number),
  propertyId: 'property-test',
  address: 'Địa chỉ kiểm thử',
  district: 'Thủ Đức',
  price: number * 100000,
  area: 35,
  capacity: 2,
  type: 'Studio',
  status: number < 48 && number > 45 ? 'RENTED' : 'AVAILABLE',
  publicationStatus: 'PUBLISHED',
  images: ['/assets/placeholders/room-placeholder.svg'],
  featured: number >= 46,
  hasHistory: false,
  amenities: ['Wifi'],
  description: 'Phòng kiểm thử',
  tour: API_TOUR_FIXTURES[`phong-${number}`],
}));
export const API_PROPERTIES: Property[] = [
  {
    id: 'property-test',
    name: 'Tòa kiểm thử',
    address: 'Địa chỉ kiểm thử',
    lat: 10.8,
    lng: 106.7,
    images: [],
    locationStatus: 'sourced',
  },
];
export const API_SCHOOLS: School[] = [
  {
    id: 'school-test',
    name: 'Trường kiểm thử',
    campus: 'Cơ sở 1',
    address: 'Địa chỉ trường',
    lat: 10.81,
    lng: 106.71,
    logo: '/assets/placeholders/room-placeholder.svg',
    source: 'test',
  },
];
export const API_RELATIONS: PropertySchool[] = [
  { propertyId: 'property-test', schoolId: 'school-test', source: 'test' },
];
export const API_HOLD: MoneyHold = {
  id: 'phong-48',
  customerId: 'customer-test',
  roomId: 'phong-48',
  contact: { name: API_ACCOUNT.name, phone: API_ACCOUNT.phone! },
  amount: 1000000,
  status: 'ACTIVE',
  isActive: true,
  paymentId: 'payment-test',
  createdAt: '2026-11-05T01:00:00Z',
  expiresAt: '2026-11-07T01:00:00Z',
};
export const API_PAYMENT: MoneyPayment = {
  id: 'payment-test',
  purpose: 'HOLD',
  holdId: API_HOLD.id,
  customerId: API_HOLD.customerId,
  amount: API_HOLD.amount,
  method: 'CASH',
  status: 'CONFIRMED',
  paidAt: API_HOLD.createdAt,
  confirmedAt: API_HOLD.createdAt,
  receipt: {
    id: 'receipt-test',
    paymentId: 'payment-test',
    number: 'BL-TEST-01',
    issuedAt: API_HOLD.createdAt,
    snapshot: {
      title: 'BIÊN LAI GIỮ CHỖ',
      payerName: API_ACCOUNT.name,
      roomCode: 'PHONG_48',
      amount: API_HOLD.amount,
    },
  },
};
