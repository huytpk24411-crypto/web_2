import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { API_ROOMS } from '../../testing/api-fixtures';
import { seedFrameFixture } from '../../testing/frame-fixture';
import { SharedModule } from '../shared-module';
import { RoomCardComponent } from './room-card';
import { FavoriteService } from '../../services/favorite-service';

describe('Room card home and catalog variants', () => {
  let fixture: ComponentFixture<RoomCardComponent>;
  let component: RoomCardComponent;
  beforeEach(async () => {
    TestBed.resetTestingModule();
    const ids = signal<string[]>([]);
    const favorites = {
      ids,
      loading: signal(false),
      pending: signal<string[]>([]),
      error: signal(''),
      has: vi.fn((id: string) => ids().includes(id)),
      toggle: vi.fn(),
    };
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
    await TestBed.configureTestingModule({
      imports: [SharedModule],
      providers: [provideRouter([]), { provide: FavoriteService, useValue: favorites }],
    }).compileComponents();
    seedFrameFixture('customer', 'room-card');
    fixture = TestBed.createComponent(RoomCardComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('room', {
      ...API_ROOMS[2],
      images: ['/first.webp', '/second.webp'],
    });
    fixture.detectChanges();
  });
  afterEach(() => {
    try {
      TestBed.resetTestingModule();
    } finally {
      if (vi.isFakeTimers()) vi.clearAllTimers();
      vi.useRealTimers();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });
  it('preserves the default card markup, HOT status and photo controls', () => {
    expect(fixture.nativeElement.querySelector('.room-card')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.home-card')).toBeNull();
    expect(fixture.nativeElement.querySelector('.room-status').textContent).toContain('HOT');
    expect(fixture.nativeElement.querySelector('.photo-count').textContent).toContain('1 / 2');
  });
  it('keeps the existing hover image rotation in the default variant', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({ matches: query === '(hover: hover)' })),
    );
    vi.useFakeTimers();
    component.start();
    vi.advanceTimersByTime(2500);
    expect(component.index()).toBe(1);
    component.stop();
  });
  it('uses a lazy cover and real room information without rotating home photos', () => {
    fixture.componentRef.setInput('variant', 'home');
    fixture.detectChanges();
    vi.useFakeTimers();
    component.start();
    vi.advanceTimersByTime(10000);
    expect(component.index()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    expect(image.getAttribute('src')).toBe('/first.webp');
    expect(image.getAttribute('loading')).toBe('lazy');
    expect(fixture.nativeElement.querySelector('.home-meta').textContent).toContain(
      '35 m² · 2 người',
    );
    expect(fixture.nativeElement.querySelector('.home-price').textContent).toContain('4.800.000');
    expect(fixture.nativeElement.querySelector('.room-card')).toBeNull();
    expect(fixture.nativeElement.querySelector('.photo-count')).toBeNull();
  });
  it('shows the tour chip only when the home room has a tour', () => {
    fixture.componentRef.setInput('variant', 'home');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.home-tour')).not.toBeNull();
    fixture.componentRef.setInput('room', { ...API_ROOMS[2], tour: undefined });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.home-tour')).toBeNull();
  });
  it('keeps the guest favorite returnUrl, roomId and action contract', () => {
    fixture.componentRef.setInput('variant', 'home');
    component.auth.serverAuthenticated.set(false);
    component.auth.account.set(null);
    fixture.detectChanges();
    const navigate = vi.spyOn(component.router, 'navigate').mockResolvedValue(true);
    fixture.nativeElement.querySelector('.home-heart').click();
    expect(navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: component.router.url, roomId: API_ROOMS[2].id, action: 'favorite' },
    });
  });
  it('retains favorite service handling and exposes per-room pending and error states', () => {
    fixture.componentRef.setInput('variant', 'home');
    fixture.detectChanges();
    const toggle = vi.spyOn(component.favorites, 'toggle').mockImplementation(() => {});
    fixture.nativeElement.querySelector('.home-heart').click();
    expect(toggle).toHaveBeenCalledWith(API_ROOMS[2].id);
    component.favorites.pending.set([API_ROOMS[2].id]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.home-heart').disabled).toBe(true);
    component.favorites.pending.set([]);
    component.favorites.error.set('Không lưu được phòng yêu thích.');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain(
      'Không lưu được',
    );
  });
});
