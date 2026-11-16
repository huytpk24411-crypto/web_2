import { CommonModule } from '@angular/common';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth-service';
import { FavoriteService } from '../../services/favorite-service';
import { NotificationService } from '../../services/notification-service';
import { CustomerModule } from '../customer-module';
import { CustomerLayoutComponent } from './customer-layout';

describe('CustomerLayoutComponent header', () => {
  let fixture: ComponentFixture<CustomerLayoutComponent>;
  let y: number;
  let reduced: boolean;
  let url: string;
  let motionChange: () => void;
  const account = signal<{ name: string } | null>(null);
  const logout = vi.fn(async () => true);
  const refresh = vi.fn(async () => undefined);
  const markRead = vi.fn();

  beforeEach(async () => {
    y = 0;
    reduced = false;
    url = '/';
    account.set(null);
    vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => y);
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        get matches() {
          return reduced;
        },
        addEventListener: (_: string, callback: () => void) => {
          motionChange = callback;
        },
        removeEventListener: vi.fn(),
      })),
    );
    await TestBed.configureTestingModule({
      imports: [CommonModule, RouterModule, CustomerModule],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { account, logout, error: signal('') } },
        { provide: FavoriteService, useValue: { ids: signal(['room-1']), error: signal('') } },
        {
          provide: NotificationService,
          useValue: {
            unread: signal(1),
            loading: signal(false),
            saving: signal(false),
            error: signal(''),
            items: signal([]),
            refresh,
            markRead,
          },
        },
      ],
    }).compileComponents();
    vi.spyOn(TestBed.inject(Router), 'url', 'get').mockImplementation(() => url);
  });

  afterEach(() => {
    fixture?.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  function render(signed = false) {
    if (signed) account.set({ name: 'Khách hàng' });
    fixture = TestBed.createComponent(CustomerLayoutComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  function scroll(value: number) {
    y = value;
    window.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
  }

  it('overlays only the home path and keeps the 24–72px hysteresis', () => {
    url = '/?source=header';
    const component = render();
    expect(component.isHome()).toBe(true);
    expect(component.headerLight()).toBe(false);
    const brand = fixture.nativeElement.querySelector('.header-brand .brand') as HTMLElement;
    expect(brand.classList.contains('brand--hero')).toBe(true);
    expect(brand.classList.contains('brand--compact')).toBe(true);
    expect(
      fixture.nativeElement.querySelector('main').classList.contains('customer-page--home'),
    ).toBe(true);
    scroll(24);
    scroll(72);
    expect(component.headerLight()).toBe(false);
    scroll(73);
    expect(component.headerLight()).toBe(true);
    expect(brand.classList.contains('brand--hero')).toBe(false);
    expect(brand.classList.contains('brand--compact')).toBe(true);
    scroll(25);
    expect(component.headerLight()).toBe(true);
    scroll(24);
    expect(component.headerLight()).toBe(false);
    expect(brand.classList.contains('brand--hero')).toBe(true);
  });

  it('links the header to the viewing list and held rooms, with icon tooltips', () => {
    render(true);
    const calendar = fixture.nativeElement.querySelector('header a[aria-label="Lịch xem của tôi"]');
    expect(calendar.getAttribute('href')).toBe('/my-viewings');
    expect(calendar.getAttribute('data-tooltip')).toBe('Lịch xem của tôi');
    expect(
      fixture.nativeElement
        .querySelector('header a[aria-label="Phòng đã giữ"]')
        .getAttribute('href'),
    ).toBe('/bookings');
    for (const selector of ['.favorite-link', '.notification-bell', '.account-toggle'])
      expect(
        fixture.nativeElement.querySelector(selector).getAttribute('data-tooltip'),
      ).toBeTruthy();
    expect(fixture.nativeElement.querySelector('header a[href="/viewings/new"]')).toBeNull();
  });
  it('starts other routes with a light sticky header and preserves login/register returnUrl', () => {
    url = '/rooms?school=university';
    const component = render();
    expect(component.isHome()).toBe(false);
    expect(component.headerLight()).toBe(true);
    expect(fixture.nativeElement.querySelector('.header-brand .brand--hero')).toBeNull();
    for (const path of ['/login', '/register']) {
      const link = fixture.nativeElement.querySelector(
        `header a[href^="${path}"]`,
      ) as HTMLAnchorElement;
      expect(new URL(link.href).searchParams.get('returnUrl')).toBe(url);
      if (path === '/login') expect(link.textContent?.trim()).toBe('Đăng nhập');
    }
    expect(fixture.nativeElement.querySelector('.favorite-link span').textContent.trim()).toBe('1');
  });

  it('hides after 16px down beyond 160px and reveals after 12px up, ignoring jitter', () => {
    const component = render();
    scroll(160);
    scroll(168);
    expect(component.headerHidden()).toBe(false);
    scroll(167);
    scroll(176);
    expect(component.headerHidden()).toBe(true);
    scroll(170);
    expect(component.headerHidden()).toBe(true);
    scroll(164);
    expect(component.headerHidden()).toBe(false);
    expect(component.headerLight()).toBe(true);
  });

  it('accumulates one-pixel scrolling in both directions', () => {
    const component = render();
    scroll(160);
    for (let position = 161; position <= 175; position++) scroll(position);
    expect(component.headerHidden()).toBe(false);
    scroll(176);
    expect(component.headerHidden()).toBe(true);
    for (let position = 175; position >= 165; position--) scroll(position);
    expect(component.headerHidden()).toBe(true);
    scroll(164);
    expect(component.headerHidden()).toBe(false);
  });

  it('updates the shared layout and closes panels after navigating to another route', async () => {
    const component = render(true);
    component.toggleAccount();
    const router = TestBed.inject(Router);
    router.resetConfig([{ path: 'rooms', children: [] }]);
    url = '/rooms';
    await router.navigateByUrl('/rooms');
    fixture.detectChanges();
    expect(component.isHome()).toBe(false);
    expect(component.headerLight()).toBe(true);
    expect(component.accountOpen()).toBe(false);
    expect(fixture.nativeElement.querySelector('main.customer-page--home')).toBeNull();
  });

  it('keeps the header visible for account menu, notifications and keyboard focus', () => {
    const component = render(true);
    component.toggleAccount();
    scroll(220);
    scroll(260);
    expect(component.headerHidden()).toBe(false);
    component.toggleNotifications();
    scroll(300);
    expect(component.headerHidden()).toBe(false);
    expect(refresh).toHaveBeenCalledOnce();
    component.closeNotifications();
    const trigger = fixture.nativeElement.querySelector('.account-toggle') as HTMLButtonElement;
    trigger.focus();
    scroll(340);
    expect(component.headerHidden()).toBe(false);
  });

  it('closes account menu on Escape and outside click, returning focus to its trigger', () => {
    const component = render(true);
    const trigger = fixture.nativeElement.querySelector('.account-toggle') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const link = fixture.nativeElement.querySelector(
      '#customer-account-menu a',
    ) as HTMLAnchorElement;
    link.focus();
    link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(component.accountOpen()).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
    trigger.click();
    document.body.click();
    fixture.detectChanges();
    expect(component.accountOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger);
    expect(
      fixture.nativeElement.querySelector('#customer-account-menu').hasAttribute('inert'),
    ).toBe(true);
  });

  it('immediately reveals a hidden header when keyboard focus enters it', () => {
    const component = render();
    scroll(200);
    expect(component.headerHidden()).toBe(true);
    const login = fixture.nativeElement.querySelector('header a.login') as HTMLAnchorElement;
    login.focus();
    expect(component.headerHidden()).toBe(false);
    scroll(240);
    expect(component.headerHidden()).toBe(false);
  });

  it('disables automatic hiding when reduced motion is enabled, including preference changes', () => {
    const component = render();
    scroll(200);
    expect(component.headerHidden()).toBe(true);
    reduced = true;
    motionChange();
    expect(component.headerHidden()).toBe(false);
    scroll(250);
    expect(component.headerHidden()).toBe(false);
  });

  it('uses the existing logout and returns to home only after success', async () => {
    const component = render(true);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    logout.mockResolvedValueOnce(false);
    await component.logout();
    expect(navigate).not.toHaveBeenCalled();
    await component.logout();
    expect(navigate).toHaveBeenCalledWith(['/']);
  });

  it('removes the passive scroll listener on destroy', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    render();
    const listener = add.mock.calls.find(([name]) => name === 'scroll')!;
    expect(listener[2]).toEqual({ passive: true });
    fixture.destroy();
    expect(remove).toHaveBeenCalledWith('scroll', listener[1]);
  });
});
