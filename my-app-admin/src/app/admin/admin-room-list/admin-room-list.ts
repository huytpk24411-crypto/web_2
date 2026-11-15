import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Room } from '../../classes/Room';
import { AdminRoomService, apiError, RoomQuery } from '../../services/admin-room-service';

@Component({
  selector: 'app-admin-room-list-frame',
  standalone: false,
  templateUrl: './admin-room-list.html',
  styleUrls: ['./admin-room-list.css'],
})
export class AdminRoomListComponent {
  rooms = inject(AdminRoomService);
  route = inject(ActivatedRoute);
  router = inject(Router);
  query = '';
  type = '';
  businessStatus = '';
  publicationStatus = '';
  minPrice = '';
  maxPrice = '';
  sort = 'updatedAt';
  page = 1;
  pageSize = 6;
  propertyId = '';
  advanced = false;
  view: 'table' | 'grid' = 'table';
  selectedIds = new Set<string>();
  previewRoom?: Room;
  private selectedState = signal<Room | undefined>(undefined);
  get selected() {
    return this.selectedState();
  }
  set selected(value: Room | undefined) {
    this.selectedState.set(value);
  }
  private completedRoomState = signal<Room | undefined>(undefined);
  get completedRoom() {
    return this.completedRoomState();
  }
  set completedRoom(value: Room | undefined) {
    this.completedRoomState.set(value);
  }
  private toastState = signal<string>('');
  get toast() {
    return this.toastState();
  }
  set toast(value: string) {
    this.toastState.set(value);
  }
  private errorState = signal<string>('');
  get error() {
    return this.errorState();
  }
  set error(value: string) {
    this.errorState.set(value);
  }
  readonly actionBusy = signal(false);
  private pendingSavedId = '';
  constructor() {
    void this.load();
    void this.rooms.loadProperties().catch((error) => (this.error = apiError(error)));
    this.route.queryParams.pipe(takeUntilDestroyed()).subscribe((params) => {
      if (params['q']) {
        this.query = params['q'];
        void this.load(1);
      }
      if (params['saved']) {
        this.pendingSavedId = params['saved'];
        if (this.rooms.get(this.pendingSavedId))
          this.completedRoom = this.rooms.get(this.pendingSavedId);
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { saved: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      }
    });
  }
  get filtered() {
    return this.rooms.list();
  }
  get pages() {
    return Array.from({ length: this.rooms.pages() }, (_, index) => index + 1).filter(
      (n) => n === 1 || n === this.rooms.pages() || Math.abs(n - this.page) <= 1,
    );
  }
  get types() {
    return [
      ...new Set(
        this.rooms
          .all()
          .map((room) => room.type)
          .filter(Boolean),
      ),
    ];
  }
  get rangeEnd() {
    return Math.min(this.page * this.pageSize, this.rooms.total());
  }
  count(
    status: 'available' | 'held' | 'rented' | 'maintenance' | 'published' | 'hidden' | 'draft',
  ) {
    return this.rooms.stats()[status];
  }
  async load(page = this.page) {
    this.page = page;
    const query: RoomQuery = {
      q: this.query,
      type: this.type,
      propertyId: this.propertyId,
      businessStatus: this.businessStatus,
      publicationStatus: this.publicationStatus,
      minPrice: this.minPrice ? Number(this.minPrice) : undefined,
      maxPrice: this.maxPrice ? Number(this.maxPrice) : undefined,
      sort: this.sort,
      page,
      limit: this.pageSize,
    };
    try {
      await this.rooms.refresh(query);
      this.page = this.rooms.page();
      this.error = '';
      if (this.pendingSavedId) {
        this.completedRoom = this.rooms.get(this.pendingSavedId);
        this.pendingSavedId = '';
      }
    } catch (error) {
      this.error = apiError(error);
    }
  }
  async export() {
    try {
      await this.rooms.export({
        q: this.query,
        type: this.type,
        propertyId: this.propertyId,
        ids: this.selectedIds.size ? [...this.selectedIds] : undefined,
        businessStatus: this.businessStatus,
        publicationStatus: this.publicationStatus,
        minPrice: this.minPrice ? Number(this.minPrice) : undefined,
        maxPrice: this.maxPrice ? Number(this.maxPrice) : undefined,
        sort: this.sort,
      });
      this.error = '';
      this.toast = this.selectedIds.size
        ? 'Đã xuất các phòng được chọn ra CSV.'
        : 'Đã xuất danh sách theo bộ lọc ra CSV.';
    } catch (error) {
      this.error = apiError(error);
    }
  }
  async clone(room: Room) {
    try {
      const source = await this.rooms.getFromApi(room.id);
      this.rooms.draft.set({
        name: source.name,
        propertyId: source.propertyId,
        ownerId: source.ownerId,
        number: '',
        code: '',
        floor: source.floor,
        address: source.address,
        district: source.district,
        type: source.type,
        price: source.price,
        deposit: source.deposit,
        fees: { ...source.fees },
        area: source.area,
        capacity: source.capacity,
        description: source.description,
        images: [...source.images],
        amenities: [...source.amenities],
        status: 'AVAILABLE',
        publicationStatus: 'DRAFT',
      });
      await this.router.navigate(['/admin/rooms/new']);
    } catch (error) {
      this.error = apiError(error);
    }
  }
  async select(room: Room) {
    this.error = '';
    try {
      this.selected = { ...room, ...(await this.rooms.getFromApi(room.id)) };
    } catch (error) {
      this.error = apiError(error);
    }
  }
  async handle(result: { action: 'hide' | 'delete' | 'republish'; room: Room }) {
    if (this.actionBusy()) return;
    this.actionBusy.set(true);
    try {
      if (result.action === 'hide') await this.rooms.hide(result.room.id);
      else if (result.action === 'republish') await this.rooms.republish(result.room.id);
      else await this.rooms.remove(result.room.id);
      this.toast =
        result.action === 'hide'
          ? `Đã ẩn tin phòng ${result.room.code}.`
          : result.action === 'republish'
            ? `Đã đăng lại phòng ${result.room.code}.`
            : `Đã xóa phòng ${result.room.code}.`;
      this.selected = undefined;
      this.selectedIds.delete(result.room.id);
      await this.load(Math.min(this.page, this.rooms.pages()));
      this.error = '';
    } catch (error) {
      const current = this.rooms.get(result.room.id);
      if (this.selected?.id === result.room.id && current?.hasActiveFlow) this.selected = current;
      this.error = apiError(error);
    } finally {
      this.actionBusy.set(false);
    }
  }
  resetFilters() {
    this.query =
      this.type =
      this.businessStatus =
      this.publicationStatus =
      this.propertyId =
      this.minPrice =
      this.maxPrice =
        '';
    this.sort = 'updatedAt';
    void this.load(1);
  }
  toggleSelected(id: string) {
    if (this.selectedIds.has(id)) this.selectedIds.delete(id);
    else this.selectedIds.add(id);
  }
  get allSelected() {
    return !!this.filtered.length && this.filtered.every((room) => this.selectedIds.has(room.id));
  }
  toggleAll() {
    const deselect = this.allSelected;
    this.filtered.forEach((room) =>
      deselect ? this.selectedIds.delete(room.id) : this.selectedIds.add(room.id),
    );
  }
  sortBy(sort: string) {
    this.sort = sort;
    void this.load(1);
  }
}
