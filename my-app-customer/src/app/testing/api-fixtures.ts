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
const tourLinks: Record<number, Record<string, [string, number][]>> = {
  '46': {
    living: [
      ['kitchen', -96],
      ['bedroom', 130],
    ],
    kitchen: [
      ['living', 16],
      ['bathroom', -120],
    ],
    bathroom: [['kitchen', 128]],
    bedroom: [['living', 135]],
  },
  '47': {
    living: [
      ['kitchen', -83],
      ['bathroom', -115],
      ['bedroom', 108],
    ],
    kitchen: [['living', 108]],
    bathroom: [['living', 122]],
    bedroom: [['living', 144]],
  },
  '48': {
    living: [
      ['kitchen', -44],
      ['bathroom', -115],
      ['bedroom', 122],
    ],
    kitchen: [['living', 65]],
    bathroom: [['living', 133]],
    bedroom: [['living', 140]],
  },
  '49': {
    living: [
      ['kitchen', -90],
      ['bathroom', -137],
      ['bedroom', 94],
    ],
    kitchen: [['living', 104]],
    bathroom: [['living', 108]],
    bedroom: [['living', 133]],
  },
  '50': {
    living: [
      ['kitchen', -115],
      ['bathroom', 148],
      ['bedroom', 108],
    ],
    kitchen: [['living', 30]],
    bathroom: [['living', 130]],
    bedroom: [['living', 135]],
  },
};
const initialViews: Record<number, Record<string, number>> = {
  '46': { kitchen: -55, bathroom: 20, bedroom: 35 },
  '47': { kitchen: 0, bathroom: -55, bedroom: 45 },
  '48': { kitchen: -25, bathroom: 0, bedroom: -30 },
  '49': { kitchen: -10, bathroom: -50, bedroom: 20 },
  '50': { kitchen: -75, bathroom: 15, bedroom: 0 },
};
const sceneLabels: Record<string, string> = {
  living: 'Phòng khách',
  kitchen: 'Bếp',
  bathroom: 'Phòng tắm',
  bedroom: 'Phòng ngủ',
};
export const API_TOUR_FIXTURES: Record<string, RoomTour> = Object.fromEntries(
  [46, 47, 48, 49, 50].map((number) => {
    const roomId = 'phong-' + number;
    return [
      roomId,
      {
        roomId,
        startScene: 'living',
        pitchLimit: 55,
        scenes: ['living', 'kitchen', 'bathroom', 'bedroom'].map((id) => ({
          id,
          label: sceneLabels[id],
          image: '/assets/tours/PHONG_' + number + '/' + id + '-v2.webp',
          initialYaw: initialViews[number][id] ?? 0,
          hotspots: tourLinks[number][id].map(([target, yaw]) => ({
            target,
            label: sceneLabels[target],
            yaw,
            pitch: -8,
          })),
        })),
      },
    ];
  }),
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
