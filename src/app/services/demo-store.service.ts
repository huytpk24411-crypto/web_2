import { Injectable, signal } from '@angular/core';
import {
  Attendance,
  BookingHold,
  BrokerageDeal,
  ContactRequest,
  DepositDossier,
  EmployeeShift,
  Favorite,
  Payment,
  Room,
  Task,
  Viewing,
} from '../models/domain';
import { SEED_ROOMS } from '../data/rooms';

export interface DemoState {
  catalogVersion?: number;
  rooms: Room[];
  favorites: Favorite[];
  viewings: Viewing[];
  contactMessages: ContactRequest[];
  bookings: BookingHold[];
  deposits: DepositDossier[];
  payments: Payment[];
  employeeShifts: EmployeeShift[];
  attendances: Attendance[];
  tasks: Task[];
  deals: BrokerageDeal[];
}
const KEY = 'ihouzz-demo-v1';
const CATALOG_VERSION = 5;
export function initialState(): DemoState {
  return {
    catalogVersion: CATALOG_VERSION,
    rooms: structuredClone(SEED_ROOMS),
    favorites: [],
    viewings: [],
    contactMessages: [],
    bookings: [],
    deposits: [],
    payments: [],
    employeeShifts: [],
    attendances: [],
    tasks: [],
    deals: [
      {
        id: 'deal1',
        roomId: 'r1',
        customerName: 'Nguyễn Trần Anh Tú',
        brokerageFee: 4200000,
        status: 'PENDING',
      },
    ],
  };
}
@Injectable({ providedIn: 'root' })
export class DemoStore {
  readonly state = signal<DemoState>(this.read());
  readonly storageWarning = signal('');
  private read(): DemoState {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (
          Object.keys(initialState())
            .filter((k) => k !== 'catalogVersion')
            .every((k) => Array.isArray(data[k]))
        ) {
          if (data.catalogVersion !== CATALOG_VERSION) {
            // Keep IDs, operational state and user-created rooms. Back up before changing catalog fields.
            try {
              if (
                data.catalogVersion !== 4 &&
                !localStorage.getItem('ihouzz-demo-before-catalog-v4')
              )
                localStorage.setItem('ihouzz-demo-before-catalog-v4', raw);
              localStorage.setItem('ihouzz-demo-before-catalog-v5', raw);
            } catch {
              /* Keep original key if storage is full. */
            }
            data.rooms = data.rooms.map((room: Room) => {
              const seed = SEED_ROOMS.find((r) => r.id === room.id);
              // Older browser snapshots predate publicationStatus/businessStatus. Keep explicit
              // hidden, held and rented states, and fill missing fields for existing seed rooms.
              const status = room.status || room.businessStatus || seed?.status || 'AVAILABLE';
              const publicationStatus =
                room.publicationStatus || seed?.publicationStatus || 'DRAFT';
              return {
                ...room,
                images: Array.isArray(room.images) ? room.images : seed?.images || [],
                ...(seed && data.catalogVersion !== 4
                  ? {
                      propertyId: seed.propertyId,
                      address: seed.address,
                      district: seed.district,
                      images: seed.images,
                      mediaStatus: seed.mediaStatus,
                      description: seed.description,
                    }
                  : {}),
                status,
                businessStatus: status,
                publicationStatus,
              };
            });
            data.catalogVersion = CATALOG_VERSION;
            try {
              localStorage.setItem(KEY, JSON.stringify(data));
            } catch {
              /* Still use migrated data in memory. */
            }
          }
          return data;
        }
      }
    } catch {
      /* Recover an invalid demo snapshot. */
    }
    return initialState();
  }
  update(change: (state: DemoState) => void): void {
    const state = structuredClone(this.state());
    change(state);
    this.state.set(state);
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      this.storageWarning.set('');
    } catch {
      this.storageWarning.set(
        'Bộ nhớ trình duyệt đã đầy. Thay đổi hiện chỉ được giữ trong phiên này.',
      );
    }
  }
  reset(): void {
    localStorage.removeItem(KEY);
    this.state.set(initialState());
  }
}
export const uid = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
