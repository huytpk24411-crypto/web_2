import { RoomSnapshot } from './Room';
export interface ViewingGuide {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  phone: string;
}

export interface ViewingRoomInfo {
  roomId: string;
  code: string;
  name: string;
  address: string;
  price: number | null;
  image: string;
}

export type ViewingSlotReason = 'PAST' | 'MINE' | 'NO_STAFF';
export interface ViewingAvailability {
  date: string;
  /** pendingGuide: week not finalized yet — booking is confirmed, guide assigned at finalize. */
  slots: {
    time: string;
    available: boolean;
    reason: ViewingSlotReason | null;
    pendingGuide?: boolean;
  }[];
}

export interface ViewingItem {
  roomId: string;
  date: string;
  startTime: string;
}

export interface ViewingOut {
  id: string;
  bookingId?: string;
  status: NonNullable<Viewing['serverStatus']>;
  date: string;
  startTime: string;
  startAt: string;
  viewerName?: string;
  viewerPhone?: string;
  visitorName?: string;
  visitorPhone?: string;
  note: string;
  rooms: { roomId: string; roomSnapshot?: RoomSnapshot }[];
  guide?: ViewingGuide | null;
  roomsInfo?: ViewingRoomInfo[];
  canEdit?: boolean;
}

export interface Viewing {
  bookingId?: string;
  guide?: ViewingGuide | null;
  roomsInfo?: ViewingRoomInfo[];
  canEdit?: boolean;
  roomSnapshots?: Record<string, RoomSnapshot>;
  id: string;
  customerId: string;
  roomIds: string[];
  name: string;
  phone: string;
  at: string;
  note: string;
  status: 'SCHEDULED' | 'CANCELLED' | 'COMPLETED';
  serverStatus?: 'CHO_XAC_NHAN' | 'DA_XAC_NHAN' | 'DA_XEM' | 'DA_HUY';
}
