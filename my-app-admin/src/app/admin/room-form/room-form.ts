import { ROOM_TYPE_LABELS } from '../../classes/display-labels';
import { AmenityAPIService } from '../../services/amenity-apiservice';
import { firstValueFrom } from 'rxjs';
import { apiMessage } from '../../services/api-message';
import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Room } from '../../classes/Room';
import { AdminRoomService, apiError } from '../../services/admin-room-service';

@Component({
  selector: 'app-room-form',
  standalone: false,
  templateUrl: './room-form.html',
  styleUrls: ['./room-form.css'],
  host: { class: 'room-admin' },
})
export class RoomFormComponent implements OnInit {
  @Input() roomId = '';
  @Input() duplicateMode = false;
  admin = inject(AdminRoomService);
  router = inject(Router);
  private amenitiesApi = inject(AmenityAPIService);
  private fb = inject(FormBuilder);
  images = signal<string[]>([]);
  error = signal('');
  saving = signal(false);
  loading = signal(true);
  toast = '';
  existing?: Room;
  preview?: Room;
  missingRoom = false;
  duplicateFound = false;
  matchedRoom?: Room;
  selectedAmenities: string[] = [];
  amenities: string[] = [];
  readonly types = Object.keys(ROOM_TYPE_LABELS);
  readonly feeFields = [
    { key: 'electricity', label: 'Điện sinh hoạt', unit: 'đ/kWh' },
    { key: 'water', label: 'Nước sinh hoạt', unit: 'đ/người/tháng' },
    { key: 'motorbike', label: 'Phí giữ xe máy', unit: 'đ/xe/tháng' },
    { key: 'management', label: 'Quản lý & Dịch vụ', unit: 'đ/phòng' },
  ];
  form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(180)]],
    code: [
      '',
      [Validators.required, Validators.pattern(/^[A-Za-z0-9_-]+$/), Validators.maxLength(40)],
    ],
    propertyId: ['', Validators.required],
    ownerId: [''],
    number: ['', [Validators.required, Validators.maxLength(40)]],
    floor: ['', Validators.maxLength(30)],
    address: ['', [Validators.required, Validators.maxLength(300)]],
    district: [''],
    type: ['', Validators.required],
    price: [0, [Validators.required, Validators.min(1)]],
    deposit: [0, [Validators.required, Validators.min(1)]],
    area: [0, [Validators.required, Validators.min(1)]],
    capacity: [2, [Validators.required, Validators.min(1), Validators.max(20)]],
    description: ['', [Validators.required, Validators.maxLength(10000)]],
    status: ['AVAILABLE' as Room['status']],
    electricity: [0, Validators.min(0)],
    water: [0, Validators.min(0)],
    motorbike: [0, Validators.min(0)],
    management: [150000, Validators.min(0)],
  });
  get properties() {
    return this.admin.properties();
  }
  get isEdit() {
    return !!this.roomId;
  }
  get property() {
    return this.properties.find((item) => item.id === this.form.controls.propertyId.value);
  }
  get roomPreview(): Room {
    const value = this.form.getRawValue();
    return {
      ...this.existing,
      ...value,
      id: this.roomId || 'preview',
      propertyName: this.property?.name || '',
      images: this.images(),
      amenities: this.selectedAmenities,
      featured: false,
      hasHistory: this.existing?.hasHistory || false,
      publicationStatus: this.existing?.publicationStatus || 'DRAFT',
    } as Room;
  }
  async ngOnInit() {
    this.form.controls.price.valueChanges.subscribe((price) => {
      if (!this.form.controls.deposit.dirty) this.form.controls.deposit.setValue(price);
    });
    try {
      await Promise.all([this.admin.loadProperties(), this.admin.refresh()]);
      try {
        const amenities = await firstValueFrom(this.amenitiesApi.getAmenities());
        this.amenities = amenities.map((item) => item.name);
      } catch (error) {
        throw new Error(apiMessage(error, 'Không tải được tiện ích.'));
      }
      const data = this.roomId ? await this.admin.getFromApi(this.roomId) : this.admin.draft();
      if (data) {
        if (this.roomId) this.existing = data as Room;
        const fees = data.fees || {};
        this.form.patchValue({
          ...data,
          ownerId: data.ownerId || '',
          deposit: data.deposit || data.price || 0,
          electricity: Number(fees['electricity'] ?? fees['Điện'] ?? 0),
          water: Number(fees['water'] ?? fees['Nước'] ?? 0),
          motorbike: Number(fees['motorbike'] ?? 0),
          management: Number(fees['management'] ?? fees['Dịch vụ'] ?? data.serviceFee ?? 150000),
        });
        this.images.set([...(data.images || [])]);
        this.selectedAmenities = [...(data.amenities || [])];
        this.amenities = [...new Set([...this.amenities, ...this.selectedAmenities])];
      }
      if (this.roomId) this.form.controls.code.disable();
      if (this.existing?.status === 'HELD' || this.existing?.status === 'RENTED')
        this.form.controls.status.disable();
      if (this.duplicateMode) await this.detectDuplicate();
    } catch (error) {
      this.error.set(apiError(error));
      this.missingRoom = !!this.roomId;
    } finally {
      this.loading.set(false);
    }
  }
  toggle(value: string) {
    this.selectedAmenities = this.selectedAmenities.includes(value)
      ? this.selectedAmenities.filter((item) => item !== value)
      : [...this.selectedAmenities, value];
  }
  selectProperty() {
    if (this.property)
      this.form.patchValue({ address: this.property.address, district: this.property.district });
    this.clearDuplicate();
  }
  generateCode() {
    const prefix = 'PHONG-' + (this.form.controls.number.value.trim() || 'ROOM');
    let code = prefix,
      i = 1;
    while (this.admin.all().some((room) => room.code.toUpperCase() === code.toUpperCase()))
      code = prefix + '-' + i++;
    this.form.controls.code.setValue(code);
    this.clearDuplicate();
    this.toast = 'Đã tạo mã phòng chưa được sử dụng.';
  }
  clearDuplicate() {
    this.duplicateFound = false;
    this.matchedRoom = undefined;
    for (const control of [this.form.controls.code, this.form.controls.number]) {
      if (control.hasError('duplicate')) {
        const errors = { ...control.errors };
        delete errors['duplicate'];
        control.setErrors(Object.keys(errors).length ? errors : null);
      }
    }
    this.error.set('');
  }
  async detectDuplicate() {
    const value = this.form.getRawValue();
    this.matchedRoom = this.admin
      .all()
      .find(
        (room) =>
          room.id !== this.roomId &&
          (room.code.trim().toUpperCase() === value.code.trim().toUpperCase() ||
            (!!value.number.trim() &&
              room.propertyId === value.propertyId &&
              room.number.trim().toUpperCase() === value.number.trim().toUpperCase())),
      );
    this.duplicateFound = !!this.matchedRoom;
    if (this.matchedRoom) {
      const control =
        this.matchedRoom.code.toUpperCase() === value.code.trim().toUpperCase()
          ? this.form.controls.code
          : this.form.controls.number;
      control.setErrors({ ...control.errors, duplicate: true });
      control.markAsTouched();
    }
    return this.duplicateFound;
  }
  insertSuggestion(text: string) {
    this.form.controls.description.setValue(
      (this.form.controls.description.value + '\n• ' + text).trim(),
    );
  }
  saveDraft() {
    void this.save(false);
  }
  publish() {
    void this.save(true);
  }
  update() {
    void this.save(false);
  }
  private async save(publish: boolean) {
    if (this.saving()) return;
    this.clearDuplicate();
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.error.set('Vui lòng kiểm tra các trường báo đỏ và nhập giá trị lớn hơn 0.');
      return;
    }
    const value = this.form.getRawValue();
    if (
      !value.name.trim() ||
      !value.address.trim() ||
      !value.number.trim() ||
      !value.description.trim()
    ) {
      this.error.set('Tên, địa chỉ, số phòng và mô tả không được chỉ chứa khoảng trắng.');
      return;
    }
    if (publish && (this.images().length < 3 || value.status !== 'AVAILABLE')) {
      this.error.set('Đăng phòng cần ít nhất 3 ảnh và trạng thái đang trống.');
      return;
    }
    const draft: Partial<Room> = {
      ...this.existing,
      ...value,
      fees: {
        electricity: value.electricity,
        water: value.water,
        motorbike: value.motorbike,
        management: value.management,
      },
      images: [...this.images()],
      amenities: [...this.selectedAmenities],
      publicationStatus: publish ? 'PUBLISHED' : this.existing?.publicationStatus || 'DRAFT',
    };
    this.saving.set(true);
    try {
      if (await this.detectDuplicate()) {
        this.admin.draft.set(draft);
        if (!this.roomId && !this.duplicateMode)
          await this.router.navigate(['/admin/rooms/new/duplicate']);
        return;
      }
      const saved = await this.admin.save(draft, this.roomId || undefined);
      await this.router.navigate(['/admin/rooms'], { queryParams: { saved: saved.id } });
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
