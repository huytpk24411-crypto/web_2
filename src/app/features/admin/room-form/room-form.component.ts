import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AdminRoomService, apiError } from '../../../services/admin-room.service';
import { Room } from '../../../models/domain';
@Component({
  selector: 'app-room-form',
  standalone: false,
  templateUrl: './room-form.component.html',
  styleUrls: ['./room-form.component.css'],
  host: { class: 'room-admin' },
})
export class RoomFormComponent implements OnInit {
  @Input() roomId = '';
  @Input() duplicateMode = false;
  admin = inject(AdminRoomService);
  router = inject(Router);
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
  readonly amenities = [
    'Máy lạnh Inverter',
    'Gác lửng kiên cố',
    'Tủ lạnh',
    'Tủ quần áo',
    'Máy giặt riêng',
    'Bếp riêng',
    'Khóa vân tay',
    'Nước nóng',
    'Wifi',
    'Ban công',
    'Sofa & Bàn trà',
    'Bàn học',
  ];
  readonly types = ['Duplex', 'Studio', 'Căn hộ dịch vụ', 'Phòng đơn', 'KTX cao cấp'];
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
      [Validators.required, Validators.pattern(/^[A-Za-z0-9-]+$/), Validators.maxLength(40)],
    ],
    propertyId: ['', Validators.required],
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
    electricity: [3500, Validators.min(0)],
    water: [100000, Validators.min(0)],
    motorbike: [100000, Validators.min(0)],
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
    try {
      await this.admin.loadProperties();
      const data = this.roomId
        ? await this.admin.getFromApi(this.roomId)
        : this.admin.draft() || (this.duplicateMode ? this.admin.all()[0] : null);
      if (data) {
        if (this.roomId) this.existing = data as Room;
        const fees = data.fees || {};
        this.form.patchValue({
          ...data,
          deposit: data.deposit || data.price || 0,
          electricity: Number(fees['electricity'] ?? 3500),
          water: Number(fees['water'] ?? 100000),
          motorbike: Number(fees['motorbike'] ?? 100000),
          management: Number(fees['management'] ?? 150000),
        });
        this.images.set([...(data.images || [])]);
        this.selectedAmenities = [...(data.amenities || [])];
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
    const prefix = 'DEMO-' + (this.form.controls.number.value.trim() || 'ROOM');
    let code = prefix,
      i = 1;
    while (this.admin.all().some((room) => room.code.toUpperCase() === code.toUpperCase()))
      code = prefix + '-' + i++;
    this.form.controls.code.setValue(code);
    this.clearDuplicate();
    this.toast = 'Đã tạo mã phòng mẫu chưa được sử dụng.';
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
    void this.save(false, true);
  }
  private async save(publish: boolean, update = false) {
    if (this.saving()) return;
    this.clearDuplicate();
    if (publish || update) {
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
    } else {
      this.form.controls.code.markAsTouched();
      this.form.controls.propertyId.markAsTouched();
      if (
        this.form.controls.code.invalid ||
        this.form.controls.propertyId.invalid ||
        !this.form.controls.code.value.trim()
      ) {
        this.error.set('Mã phòng và tòa nhà là bắt buộc khi lưu bản nháp.');
        return;
      }
      const raw = this.form.getRawValue();
      if (
        [
          raw.price,
          raw.deposit,
          raw.area,
          raw.electricity,
          raw.water,
          raw.motorbike,
          raw.management,
        ].some((value) => value < 0)
      ) {
        this.error.set('Giá thuê, cọc, diện tích và phí sinh hoạt không được âm.');
        return;
      }
    }
    const value = this.form.getRawValue();
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
      publicationStatus: this.existing?.publicationStatus || 'DRAFT',
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
      if (publish) await this.admin.publish(saved.id);
      await this.router.navigate(['/admin/rooms'], { queryParams: { saved: saved.id } });
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
