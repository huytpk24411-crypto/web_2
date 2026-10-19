import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, Validators } from '@angular/forms';
import { AdminRoomService, apiError, RoomQuery } from '../../../services/admin-room.service';
import { Room } from '../../../models/domain';

@Component({
  selector: 'app-admin-room-list-frame',
  standalone: false,
  templateUrl: './admin-room-list-frame.component.html',
  styleUrls: ['./admin-room-list-frame.component.css'],
})
export class AdminRoomListFrameComponent {
  rooms = inject(AdminRoomService);
  route = inject(ActivatedRoute);
  router = inject(Router);
  private fb = inject(FormBuilder);
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
  selected: Room | undefined;
  completedRoom: Room | undefined;
  toast = '';
  error = '';
  showPropertyForm = false;
  propertySaving = false;
  private pendingSavedId = '';
  propertyError = '';
  propertyForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    address: ['', Validators.required],
    district: ['', Validators.required],
    lat: [''],
    lng: [''],
  });
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
        ? 'Đã xuất các phòng được chọn ra CSV mẫu.'
        : 'Đã xuất danh sách theo bộ lọc ra CSV mẫu.';
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
      this.error = apiError(error);
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
  async createProperty() {
    this.propertyForm.markAllAsTouched();
    if (this.propertyForm.invalid || this.propertySaving) return;
    const form = this.propertyForm.getRawValue();
    try {
      this.propertySaving = true;
      await this.rooms.createProperty({
        name: form.name,
        address: form.address,
        district: form.district,
        lat: form.lat ? Number(form.lat) : null,
        lng: form.lng ? Number(form.lng) : null,
      });
      this.propertyForm.reset();
      this.showPropertyForm = false;
      this.propertyError = '';
      this.toast = 'Đã thêm tòa nhà vào dữ liệu.';
    } catch (error) {
      this.propertyError = apiError(error);
    } finally {
      this.propertySaving = false;
    }
  }
}
