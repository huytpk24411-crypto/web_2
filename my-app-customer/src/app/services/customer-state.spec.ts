import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { signal } from '@angular/core';
import { API_ACCOUNT } from '../testing/api-fixtures';
import { Notification } from '../classes/Notification';
import { AuthService } from './auth-service';
import { CustomerAPIService } from './customer-apiservice';
import { FavoriteService } from './favorite-service';
import { NotificationService } from './notification-service';

describe('P2 account-scoped state after API awaits', () => {
  const auth = {
    account: signal({ ...API_ACCOUNT }),
    serverAuthenticated: signal(true),
    hasRole: () => true,
  };
  const notification: Notification = {
    id: 'tb-real',
    accountId: API_ACCOUNT.id,
    type: 'VIEWING_ASSIGNED',
    title: 'Đã phân công lịch xem',
    body: 'Chuyên viên sẽ liên hệ với bạn.',
    entityType: 'Viewing',
    entityId: 'lx-real',
    read: false,
    readAt: null,
    createdAt: '2026-11-03T10:00:00+07:00',
  };
  const api = {
    favorites: vi.fn(),
    addFavorite: vi.fn(),
    removeFavorite: vi.fn(),
    notifications: vi.fn(),
    readNotification: vi.fn(),
    readAllNotifications: vi.fn(),
  };
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.resetAllMocks();
    auth.account.set({ ...API_ACCOUNT });
    auth.serverAuthenticated.set(true);
    api.favorites.mockReturnValue(of([{ roomId: 'phong-48' }]));
    api.addFavorite.mockReturnValue(of({ roomId: 'phong-49' }));
    api.removeFavorite.mockReturnValue(of({ removed: true }));
    api.notifications.mockReturnValue(of([notification]));
    api.readNotification.mockReturnValue(of({ ...notification, read: true }));
    api.readAllNotifications.mockReturnValue(of({ updated: 1 }));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
        { provide: CustomerAPIService, useValue: api },
      ],
    });
  });
  it('loads favorites and preserves acknowledged state on connection failure', async () => {
    const favorites = TestBed.inject(FavoriteService);
    TestBed.tick();
    await Promise.resolve();
    expect(favorites.ids()).toEqual(['phong-48']);
    await favorites.save('phong-49', true);
    expect(favorites.ids()).toEqual(['phong-48', 'phong-49']);
    api.removeFavorite.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    await expect(favorites.save('phong-48', false)).rejects.toMatchObject({ status: 0 });
    expect(favorites.ids()).toEqual(['phong-48', 'phong-49']);
    auth.account.set({ ...API_ACCOUNT, id: 'different-customer' });
    expect(favorites.ids()).toEqual([]);
  });
  it('preserves favorites when the API rejects a mutation', async () => {
    const favorites = TestBed.inject(FavoriteService);
    TestBed.tick();
    await Promise.resolve();
    api.removeFavorite.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    await expect(favorites.save('phong-48', false)).rejects.toMatchObject({ status: 403 });
    expect(favorites.ids()).toEqual(['phong-48']);
  });
  it.each([0, 503])(
    'does not mark a notification read after a connection failure %s',
    async (status) => {
      const notifications = TestBed.inject(NotificationService);
      TestBed.tick();
      await Promise.resolve();
      api.readNotification.mockReturnValue(throwError(() => new HttpErrorResponse({ status })));
      await notifications.markRead(notification.id);
      expect(notifications.unread()).toBe(1);
      expect(notifications.error()).toBe('Không kết nối được máy chủ. Vui lòng thử lại.');
    },
  );
  it('updates unread counts after await and keeps rejected reads unchanged', async () => {
    const notifications = TestBed.inject(NotificationService);
    TestBed.tick();
    await Promise.resolve();
    expect(notifications.unread()).toBe(1);
    api.readNotification.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    await notifications.markRead(notification.id);
    expect(notifications.unread()).toBe(1);
    expect(notifications.error()).toContain('không có quyền');
    await notifications.markRead();
    expect(notifications.unread()).toBe(0);
    expect(api.readAllNotifications).toHaveBeenCalledOnce();
    auth.account.set({ ...API_ACCOUNT, id: 'different-customer' });
    expect(notifications.items()).toEqual([]);
  });
});
