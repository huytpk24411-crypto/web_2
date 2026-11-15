import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  Input,
  OnDestroy,
  ViewChild,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import L from 'leaflet';
import 'leaflet.markercluster';
import { Property } from '../../classes/Property';
import { School } from '../../classes/School';
import { LocationService } from '../../services/location-service';
import { RoomSearchService } from '../../services/room-search-service';

@Component({
  selector: 'app-map-search',
  standalone: false,
  templateUrl: './map-search.html',
  styleUrls: ['./map-search.css'],
})
export class MapSearchComponent implements AfterViewInit, OnDestroy {
  @Input() compact = false;
  @ViewChild('mapCanvas') canvas!: ElementRef<HTMLDivElement>;
  search = inject(RoomSearchService);
  locations = inject(LocationService);
  router = inject(Router);
  selectedProperty = this.search.selectedProperty;
  schoolPanel = signal(false);
  showSchools = signal(true);
  showProperties = signal(true);
  mapError = signal('');
  tileLoaded = signal(false);
  ready = signal(false);
  private map?: L.Map;
  private schoolsLayer?: L.MarkerClusterGroup;
  private buildingsLayer?: L.LayerGroup;
  private tiles?: L.TileLayer;
  private resize?: ResizeObserver;
  private timeout?: ReturnType<typeof setTimeout>;
  private lastSchool = '';
  private buildingMarkers = new Map<string, L.Marker>();
  constructor() {
    effect(() => {
      this.search.results();
      this.search.filter();
      this.showSchools();
      this.showProperties();
      this.selectedProperty();
      this.ready();
      this.renderMarkers();
    });
  }
  ngAfterViewInit() {
    if (typeof ResizeObserver !== 'undefined') {
      this.resize = new ResizeObserver(() => {
        if (!this.map) this.initialize();
        else this.map.invalidateSize();
      });
      this.resize.observe(this.canvas.nativeElement);
    }
    this.initialize();
  }
  private initialize() {
    if (this.map || !this.canvas.nativeElement.clientWidth) return;
    try {
      this.map = L.map(this.canvas.nativeElement, {
        scrollWheelZoom: true,
        zoomControl: false,
        zoomSnap: 0.25,
      });
      L.control.zoom({ position: 'topright' }).addTo(this.map);
      this.tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
      }).addTo(this.map);
      this.tiles.on('tileload', () => this.tileLoaded.set(true));
      this.tiles.on('tileerror', () =>
        this.mapError.set(
          'Một số ô bản đồ chưa tải được. Kiểm tra Internet hoặc thử tải lại; danh sách phòng vẫn dùng được.',
        ),
      );
      this.timeout = setTimeout(() => {
        if (!this.tileLoaded())
          this.mapError.set(
            'Chưa tải được bản đồ OpenStreetMap. Bạn vẫn có thể tìm phòng bên dưới.',
          );
      }, 12000);
      this.schoolsLayer = L.markerClusterGroup({
        maxClusterRadius: 48,
        disableClusteringAtZoom: 15,
        showCoverageOnHover: false,
        iconCreateFunction: (cluster) =>
          L.divIcon({
            className: 'school-cluster',
            html: `<span>${cluster.getChildCount()}</span>`,
            iconSize: [46, 46],
          }),
      }).addTo(this.map);
      this.buildingsLayer = L.markerClusterGroup({
        maxClusterRadius: 32,
        disableClusteringAtZoom: 15,
        showCoverageOnHover: false,
        iconCreateFunction: (cluster) =>
          L.divIcon({
            className: 'building-cluster',
            html: `<span>${cluster.getChildCount()} tòa</span>`,
            iconSize: [85, 34],
          }),
      }).addTo(this.map);
      this.resetView();
      this.ready.set(true);
    } catch (error) {
      console.error('Leaflet initialization failed', error);
      this.mapError.set(
        'Không khởi tạo được Leaflet. Hãy tải lại trang; bộ lọc và danh sách phòng vẫn hoạt động.',
      );
    }
  }
  get visibleProperties() {
    return this.locations
      .properties()
      .filter(
        (p) =>
          this.locations.mapped(p) &&
          (p.id === this.selectedProperty() ||
            this.search.results().some((r) => r.propertyId === p.id)),
      );
  }
  get property() {
    return this.visibleProperties.find((p) => p.id === this.selectedProperty());
  }
  get school() {
    return this.locations.school(this.search.filter().schoolId || '');
  }
  get propertyRooms() {
    return this.availableRooms(this.property?.id);
  }
  private availableRooms(propertyId: string | undefined) {
    return this.search.rooms
      .publishedRooms()
      .filter((r) => r.propertyId === propertyId && r.status === 'AVAILABLE');
  }
  get unmapped() {
    return this.search.results().filter((r) => {
      const p = this.locations.property(r.propertyId);
      return !p || !this.locations.mapped(p);
    }).length;
  }
  resetView() {
    const points: L.LatLngTuple[] = this.locations.schools.map((s) => [s.lat, s.lng]);
    if (points.length)
      this.map?.fitBounds(L.latLngBounds(points).pad(0.04), {
        padding: [40, 40],
        maxZoom: 14,
        animate: false,
      });
    else this.mapError.set('Chưa có tọa độ trường có nguồn để xác định khung nhìn.');
  }
  retry() {
    this.mapError.set('');
    this.tiles?.redraw();
  }
  searchBounds() {
    if (this.map) {
      const b = this.map.getBounds();
      this.search.set({
        bounds: [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map((n) => +n.toFixed(6)),
      });
    }
  }
  selectSchool(s: School) {
    this.schoolPanel.set(true);
    this.selectedProperty.set(null);
    this.search.school(s.id);
  }
  selectProperty(p: Property) {
    this.selectedProperty.set(p.id);
    this.schoolPanel.set(false);
    this.map?.panTo([p.lat!, p.lng!]);
  }
  closeProperty() {
    const id = this.selectedProperty();
    this.buildingMarkers
      .get(id || '')
      ?.getElement()
      ?.focus();
    this.selectedProperty.set(null);
  }
  @HostListener('keydown.escape', ['$event'])
  onEscape(event: Event) {
    if (!this.selectedProperty()) return;
    event.preventDefault();
    event.stopPropagation();
    this.closeProperty();
  }
  private renderMarkers() {
    if (!this.map || !this.schoolsLayer || !this.buildingsLayer) return;
    const schoolId = this.search.filter().schoolId || '';
    if (schoolId !== this.lastSchool) {
      this.lastSchool = schoolId;
      const school = this.locations.school(schoolId);
      if (school) {
        this.map.setView([school.lat, school.lng], 15, { animate: false });
        this.schoolPanel.set(true);
      } else this.schoolPanel.set(false);
    }
    const focusedProperty = (document.activeElement as HTMLElement | null)?.dataset['propertyId'];
    this.schoolsLayer.clearLayers();
    this.buildingsLayer.clearLayers();
    this.buildingMarkers.clear();
    if (this.showSchools())
      for (const s of this.locations.schools) {
        const selected = s.id === this.search.filter().schoolId;
        const root = document.createElement('div');
        root.className =
          'school-logo' +
          (selected ? ' selected' : '') +
          (['hcmussh', 'ufm'].includes(s.id) ? ' dark-logo' : '');
        const img = document.createElement('img');
        img.src = s.logo;
        img.alt = s.name;
        img.onerror = () => {
          img.remove();
          root.textContent = s.id.toUpperCase();
        };
        root.appendChild(img);
        const m = L.marker([s.lat, s.lng], {
          icon: L.divIcon({
            html: root,
            className: 'school-marker',
            iconSize: [48, 48],
            iconAnchor: [24, 24],
          }),
          title: s.name + ' · ' + s.campus,
          alt: s.name,
          keyboard: true,
        });
        m.on('click', () => this.selectSchool(s));
        m.on('add', () => {
          m.getElement()?.setAttribute('aria-label', s.name + ' · ' + s.campus);
          m.getElement()?.setAttribute('aria-pressed', String(selected));
        });
        this.schoolsLayer.addLayer(m);
      }
    if (this.showProperties())
      for (const p of this.visibleProperties) {
        const root = document.createElement('div');
        root.className = 'building-label' + (p.id === this.selectedProperty() ? ' selected' : '');
        const available = this.availableRooms(p.id).length;
        root.textContent = p.name.length > 22 ? p.name.slice(0, 21) + '…' : p.name;
        root.title = p.name;
        const m = L.marker([p.lat!, p.lng!], {
          icon: L.divIcon({
            html: root,
            className: 'building-marker',
            iconSize: [180, 30],
            iconAnchor: [90, 30],
          }),
          title: p.name,
          alt: p.name,
          keyboard: true,
        });
        m.on('click', () => this.selectProperty(p));
        m.on('add', () => {
          const element = m.getElement();
          if (!element) return;
          element.dataset['propertyId'] = p.id;
          element.setAttribute('aria-label', `Tòa nhà ${p.name}, ${available} phòng trống`);
          element.setAttribute('aria-expanded', String(p.id === this.selectedProperty()));
          element.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.stopPropagation();
              this.selectProperty(p);
            }
          });
          if (focusedProperty === p.id) element.focus();
        });
        this.buildingMarkers.set(p.id, m);
        this.buildingsLayer.addLayer(m);
      }
  }
  ngOnDestroy() {
    this.resize?.disconnect();
    clearTimeout(this.timeout);
    this.map?.remove();
  }
}
