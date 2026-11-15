import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { seedFrameFixture } from '../../testing/frame-fixture';
import { CustomerModule } from '../customer-module';
import { CustomerHomeComponent } from './customer-home';
import { API_ROOMS, API_SCHOOLS } from '../../testing/api-fixtures';
describe('CustomerHomeComponent', () => {
  beforeEach(async () => {
    TestBed.resetTestingModule();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [CustomerModule],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: {},
              paramMap: convertToParamMap({ id: 'phong-48' }),
              queryParamMap: convertToParamMap({ roomId: 'phong-48' }),
            },
            queryParams: of({}),
            params: of({ id: 'phong-48' }),
          },
        },
      ],
    }).compileComponents();
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
  it('khởi tạo và render frame bằng HTML', async () => {
    seedFrameFixture('customer', 'customer-home-frame');
    const fixture = TestBed.createComponent(CustomerHomeComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.not-found')).toBeNull();
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.children.length).toBeGreaterThan(0);
  });
  it('shows only available published HOT rooms', () => {
    seedFrameFixture('customer', 'customer-home-frame');
    const fixture = TestBed.createComponent(CustomerHomeComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.hot().map((room) => room.code)).toEqual([
      'PHONG_48',
      'PHONG_49',
      'PHONG_50',
    ]);
    expect(fixture.componentInstance.hot().filter((room) => room.status === 'RENTED')).toHaveLength(
      0,
    );
    expect(fixture.nativeElement.querySelectorAll('.hero-slide')).toHaveLength(3);
    expect(fixture.nativeElement.querySelectorAll('h1')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.hot-grid')).toBeNull();
  });
  it('curates at most six unique filtered rooms, preferring rooms outside the carousel', () => {
    seedFrameFixture('customer', 'customer-home-frame');
    const fixture = TestBed.createComponent(CustomerHomeComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.discovered().length).toBeLessThanOrEqual(6);
    expect(new Set(component.discovered().map((room) => room.id)).size).toBe(
      component.discovered().length,
    );
    expect(
      component
        .discovered()
        .slice(0, 2)
        .every((room) => !room.featured),
    ).toBe(true);
    component.search.filter.set({ maxPrice: 4400000 });
    fixture.detectChanges();
    expect(component.discovered().map((room) => room.id)).toEqual(['phong-44']);
    expect(component.hot()).toHaveLength(3);
    expect(fixture.nativeElement.querySelector('.home-card')).not.toBeNull();
  });
  it('preserves empty filters and provides clear and catalog retry actions', () => {
    seedFrameFixture('customer', 'customer-home-frame');
    const fixture = TestBed.createComponent(CustomerHomeComponent);
    const component = fixture.componentInstance;
    component.search.filter.set({ maxPrice: 1 });
    fixture.detectChanges();
    expect(component.search.filter().maxPrice).toBe(1);
    expect(fixture.nativeElement.querySelector('.home-empty').textContent).toContain('Xóa bộ lọc');
    const clear = vi.spyOn(component.search, 'clear');
    fixture.nativeElement.querySelector('.home-empty button').click();
    expect(clear).toHaveBeenCalled();
    component.rooms.error.set('Không tải được danh mục');
    fixture.detectChanges();
    const refresh = vi.spyOn(component.rooms, 'refresh');
    fixture.nativeElement.querySelector('.home-notice button').click();
    expect(refresh).toHaveBeenCalled();
  });
  it('expands every school and counts actual available published rooms', () => {
    seedFrameFixture('customer', 'customer-home-frame');
    const fixture = TestBed.createComponent(CustomerHomeComponent);
    const component = fixture.componentInstance;
    component.locations.setCatalog(
      [],
      Array.from({ length: 8 }, (_, i) => ({ ...API_SCHOOLS[0], id: 'school-' + i })),
      [],
    );
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.school-tile')).toHaveLength(6);
    component.allSchools.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.school-tile')).toHaveLength(8);
    expect(component.schoolCount('school-7')).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('.faq details')).toHaveLength(4);
    expect(fixture.nativeElement.querySelectorAll('.faq summary')).toHaveLength(4);
    expect(fixture.nativeElement.querySelector('.faq').textContent).toContain(
      'Ngân hàng/ZaloPay/MoMo',
    );
  });
  it('shows skeletons during catalog loading and keeps the hero and map in place', () => {
    seedFrameFixture('customer', 'customer-home-frame');
    const fixture = TestBed.createComponent(CustomerHomeComponent);
    fixture.componentInstance.rooms.loading.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.room-skeleton')).toHaveLength(6);
    expect(fixture.nativeElement.querySelector('h1')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#home-map .map-only')).not.toBeNull();
  });
  it('hides empty need collections and links real tour rooms to hasTour=1', () => {
    seedFrameFixture('customer', 'customer-home-frame');
    const fixture = TestBed.createComponent(CustomerHomeComponent);
    fixture.detectChanges();
    const links = Array.from(
      fixture.nativeElement.querySelectorAll('.collection'),
    ) as HTMLAnchorElement[];
    expect(links.some((link) => link.href.includes('maxPrice=4000000'))).toBe(false);
    const tourLink = links.find((link) => link.href.includes('hasTour=1'))!;
    expect(tourLink.textContent).toContain('3 phòng phù hợp');
    expect(tourLink.querySelector('img')!.alt).toBe(API_ROOMS[2].name);
  });
});
