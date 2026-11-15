import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { registerLocaleData } from '@angular/common';
import localeVi from '@angular/common/locales/vi';
import { LOCALE_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import L from 'leaflet';
import { Room } from '../../classes/Room';
import { RoomService } from '../../services/room-service';
import { API_PROPERTIES, API_RELATIONS, API_ROOMS, API_SCHOOLS } from '../../testing/api-fixtures';
import { SharedModule } from '../shared-module';
import { MapSearchComponent } from './map-search';

registerLocaleData(localeVi);

describe('MAP-01 building markers and available rooms', () => {
  let fixture: ComponentFixture<MapSearchComponent>;
  let component: MapSearchComponent;
  let rooms: RoomService;
  let http: HttpTestingController;
  const property = { ...API_PROPERTIES[0], name: 'Tòa nhà có tên rất dài để kiểm tra nhãn' };
  const available = { ...API_ROOMS[2], businessStatus: 'AVAILABLE' as const };
  const catalog: Room[] = [
    available,
    { ...available, id: 'held', status: 'HELD', businessStatus: 'HELD' },
    { ...available, id: 'rented', status: 'RENTED', businessStatus: 'RENTED' },
    { ...available, id: 'maintenance', status: 'MAINTENANCE', businessStatus: 'MAINTENANCE' },
    { ...available, id: 'draft', publicationStatus: 'DRAFT' },
    { ...available, id: 'hidden', publicationStatus: 'HIDDEN' },
    { ...available, id: 'other', propertyId: 'other-building' },
  ];

  async function loadCatalog(values: Room[]) {
    const pending = rooms.refresh();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/data/rooms').flush(JSON.stringify(values));
    http.expectOne('/data/properties').flush(JSON.stringify([property]));
    http.expectOne('/data/schools').flush(JSON.stringify(API_SCHOOLS));
    http.expectOne('/data/property-schools').flush(JSON.stringify(API_RELATIONS));
    await pending;
  }
  function marker(): HTMLElement {
    return fixture.nativeElement.querySelector('.building-marker');
  }
  function panel(): HTMLElement | null {
    return fixture.nativeElement.querySelector('.building-panel');
  }

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SharedModule],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        // Same locale as AppModule so prices render as 4.800.000.
        { provide: LOCALE_ID, useValue: 'vi' },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    rooms = TestBed.inject(RoomService);
    await loadCatalog(catalog);
    fixture = TestBed.createComponent(MapSearchComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    // Use real Leaflet markers without requesting tiles or relying on canvas dimensions.
    const map = L.map(component.canvas.nativeElement, { maxZoom: 19 }).setView(
      [property.lat!, property.lng!],
      16,
    );
    map.createPane('buildings'); // building markers live in their own pane above school logos
    component['map'] = map;
    component['schoolsLayer'] = L.markerClusterGroup().addTo(map);
    component['buildingsLayer'] = L.layerGroup().addTo(map);
    component.ready.set(true);
    fixture.detectChanges();
  });
  afterEach(() => {
    try {
      http?.verify();
    } finally {
      try {
        TestBed.resetTestingModule();
      } finally {
        if (vi.isFakeTimers()) vi.clearAllTimers();
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
      }
    }
  });

  it('shows a shortened building name with full title and available count in aria-label', () => {
    const element = marker();
    expect(element.textContent).toBe(property.name.slice(0, 21) + '…');
    expect(element.textContent!.length).toBeLessThanOrEqual(22);
    expect(element.title).toBe(property.name);
    expect(element.getAttribute('aria-label')).toBe(`Tòa nhà ${property.name}, 1 phòng trống`);
    expect(element.tabIndex).toBe(0);
    expect(element.textContent).not.toContain('trống');
  });

  it('opens a compact panel linking only published available rooms of the selected building', () => {
    marker().click();
    fixture.detectChanges();
    expect(panel()!.textContent).toContain(property.name);
    expect(panel()!.textContent).toContain(property.address);
    expect(panel()!.textContent).toContain('1 phòng trống');
    const links = panel()!.querySelectorAll<HTMLAnchorElement>('.map-room');
    expect(links.length).toBe(1);
    expect(links[0].getAttribute('href')?.split('?')[0]).toBe(`/rooms/${available.id}`);
    expect(links[0].textContent).toContain(available.code);
    expect(links[0].textContent).toContain(available.name);
    expect(links[0].textContent).toContain('4.800.000 đ/tháng');
    expect(component.propertyRooms.map((room) => room.id)).toEqual([available.id]);
  });

  it('lists all available rooms of the building even when search filters match fewer rooms', () => {
    component.search.filter.set({ minPrice: available.price + 1 });
    component.selectProperty(property);
    fixture.detectChanges();
    expect(component.search.results()).toEqual([]);
    expect(panel()!.querySelectorAll('.map-room').length).toBe(1);
    expect(marker().getAttribute('aria-label')).toContain('1 phòng trống');
  });

  it('keeps the selected building visible and shows the empty state when its last room is taken', async () => {
    marker().click();
    fixture.detectChanges();
    await loadCatalog([{ ...available, status: 'HELD', businessStatus: 'HELD' }]);
    fixture.detectChanges();
    expect(panel()!.textContent).toContain('0 phòng trống');
    expect(panel()!.textContent).toContain('Hiện chưa có phòng trống');
    expect(panel()!.querySelectorAll('.map-room').length).toBe(0);
    expect(marker().getAttribute('aria-label')).toContain('0 phòng trống');
  });

  it('opens with Enter, preserves marker focus, and closes with Escape from marker or panel', () => {
    marker().focus();
    marker().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    fixture.detectChanges();
    expect(panel()).not.toBeNull();
    expect(document.activeElement).toBe(marker());
    marker().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(marker());
    marker().click();
    fixture.detectChanges();
    const close = panel()!.querySelector<HTMLButtonElement>('.close')!;
    close.focus();
    close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(marker());
  });

  it('preserves school markers, layer controls and map actions', () => {
    // School markers live in a cluster group, so read them from the layer rather than the DOM.
    const schools = (component['schoolsLayer'] as L.MarkerClusterGroup).getLayers() as L.Marker[];
    expect(schools.some((m) => m.options.title?.includes(API_SCHOOLS[0].name))).toBe(true);
    expect(fixture.nativeElement.querySelectorAll('.map-layers input').length).toBe(3);
    const tools = fixture.nativeElement.querySelector('.map-tools').textContent;
    expect(tools).toContain('Về khu vực ban đầu');
    expect(tools).toContain('Tìm trong vùng bản đồ này');
  });
  it('renders the map-only home variant with markers and panel, without the old hero or filters', () => {
    fixture.componentRef.setInput('variant', 'map');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.hero')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-room-filters')).toBeNull();
    expect(fixture.nativeElement.querySelector('.map-only .map-canvas')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.map-layers input')).toHaveLength(3);
    marker().click();
    fixture.detectChanges();
    expect(panel()!.textContent).toContain('1 phòng trống');
    expect(fixture.nativeElement.querySelector('.leaflet-control-attribution')).not.toBeNull();
  });
  it('keeps the compact catalog filters and hides its hero', () => {
    fixture.componentRef.setInput('compact', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.hero')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-room-filters')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.compact')).not.toBeNull();
  });
});
