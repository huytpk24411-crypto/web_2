import { RoomSnapshot } from './Room';
export interface FavoriteRecord {
  id: string;
  customerId: string;
  roomId: string;
  createdAt: string;
}

export interface ViewingRecord {
  id: string;
  customerId: string;
  customerProfileId: string;
  employeeId: string | null;
  date: string;
  startTime: string;
  endTime: string;
  startAt: string;
  visitorName: string;
  visitorPhone: string;
  note: string;
  status: 'CHO_XAC_NHAN' | 'DA_XAC_NHAN' | 'DA_XEM' | 'DA_HUY';
  rooms: {
    roomId: string;
    order: number;
    viewStatus: string;
    note: string;
    roomSnapshot?: RoomSnapshot;
  }[];
}
