export interface RoomSnapshot {
  id: string;
  code: string;
  name: string;
  type: string;
  address: string;
  propertyId: string;
  propertyName: string;
  ownerId: string;
  monthlyRent: number;
  area: number;
  capacity: number;
}
export interface Room {
  id: string;
  code: string;
  name: string;
  propertyId: string;
  ownerId?: string;
  number: string;
  address: string;
  district: string;
  price: number;
  monthlyRent?: number;
  standardDeposit?: number;
  serviceFee?: number;
  electricityPrice?: number;
  waterPrice?: number;
  area: number;
  capacity: number;
  type: string;
  status: 'AVAILABLE' | 'HELD' | 'RENTED' | 'MAINTENANCE';
  businessStatus?: 'AVAILABLE' | 'HELD' | 'RENTED' | 'MAINTENANCE';
  lock?: { kind: 'HOLD' | 'DEPOSIT' | 'CONTRACT'; expiresAt?: string | null } | null;
  publicationStatus: 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
  images: string[];
  featured: boolean;
  hasHistory: boolean;
  hasActiveFlow?: boolean;
  amenities: string[];
  description: string;
  floor?: string;
  deposit?: number;
  fees?: Record<string, number | string>;
  propertyName?: string;
  createdAt?: string;
  updatedAt?: string;
  version?: number;
  mediaStatus?: 'design-reference' | 'illustrative' | 'confirmed';
}

export function isPublicRoom(
  room: Pick<Room, 'status' | 'publicationStatus' | 'businessStatus' | 'lock'>,
): boolean {
  return (
    room.publicationStatus === 'PUBLISHED' &&
    ['AVAILABLE', 'HELD'].includes(room.status) &&
    !['RENTED', 'MAINTENANCE'].includes(room.businessStatus || room.status) &&
    room.lock?.kind !== 'CONTRACT'
  );
}

export function canScheduleViewing(
  room?: Pick<Room, 'status' | 'publicationStatus' | 'lock'>,
): boolean {
  return (
    room?.publicationStatus === 'PUBLISHED' &&
    (room.status === 'AVAILABLE' || (room.status === 'HELD' && room.lock?.kind === 'HOLD'))
  );
}
