import { catalogIsActive } from '../../classes/display-labels';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AuditEntry, AuditPage, CatalogRecord, CatalogResource } from '../../classes/AdminCatalog';
import { Property, PropertySchool } from '../../classes/Property';
import { School } from '../../classes/School';
import { AdminCatalogAPIService } from '../../services/admin-catalog-apiservice';
import { UploadAPIService } from '../../services/upload-apiservice';
import { LocationService } from '../../services/location-service';

type Section = CatalogResource | 'audit-logs';
interface Field {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  min?: number;
  max?: number;
  options?: { value: string; label: string }[];
}
@Component({
  selector: 'app-admin-catalog',
  standalone: false,
  templateUrl: './admin-catalog.html',
  styleUrl: './admin-catalog.css',
})
export class AdminCatalogComponent {
  readonly api = inject(AdminCatalogAPIService);
  private uploads = inject(UploadAPIService);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);
  private locations = inject(LocationService);
  private roomOptions: { id: string; code: string; name: string }[] = [];
  readonly sections: { key: Section; label: string }[] = [
    { key: 'owners', label: 'Chủ phòng' },
    { key: 'properties', label: 'Tòa nhà' },
    { key: 'schools', label: 'Trường học' },
    { key: 'brokerage-agreements', label: 'Thỏa thuận môi giới' },
    { key: 'work-locations', label: 'Địa điểm làm việc' },
    { key: 'customers', label: 'Khách hàng' },
    { key: 'audit-logs', label: 'Nhật ký thay đổi' },
  ];
  section: Section = 'owners';
  readonly rows = signal<CatalogRecord[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly toast = signal('');
  readonly detail = signal<CatalogRecord | null>(null);
  readonly auditDetail = signal<AuditEntry | null>(null);
  form = new FormGroup<Record<string, FormControl>>({});
  fields: Field[] = [];
  private editingState = signal<string | null | undefined>(undefined);
  get editing() {
    return this.editingState();
  }
  set editing(value: string | null | undefined) {
    this.editingState.set(value);
  }
  action?: { kind: 'delete' | 'deactivate'; record: CatalogRecord };
  endDate = new Date().toISOString().slice(0, 10);
  attempted = false;
  query = '';
  entityType = '';
  actorId = '';
  from = '';
  to = '';
  audit: AuditPage = { items: [], page: 1, pages: 1, total: 0, limit: 20 };
  page = 1;
  readonly limit = 10;
  private loadId = 0;
  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const section = params.get('section') as Section;
      this.section = this.sections.some((item) => item.key === section) ? section : 'owners';
      this.editing = undefined;
      this.detail.set(null);
      this.query = '';
      this.page = 1;
      void this.load();
    });
  }
  get title() {
    return this.sections.find((item) => item.key === this.section)!.label;
  }
  get filtered() {
    const query = this.query.trim().toLocaleLowerCase('vi');
    return this.rows().filter(
      (row) =>
        !query ||
        [row.id, row.name, row.fullName, row.phone, row['roomId'], row['address']].some((value) =>
          String(value || '')
            .toLocaleLowerCase('vi')
            .includes(query),
        ),
    );
  }
  get pages() {
    return Math.max(1, Math.ceil(this.filtered.length / this.limit));
  }
  get visibleRows() {
    return this.filtered.slice((this.page - 1) * this.limit, this.page * this.limit);
  }
  name(record: CatalogRecord) {
    return record.fullName || record.name || String(record['roomId'] || record.id);
  }
  status(record: CatalogRecord) {
    if (this.section === 'work-locations')
      return catalogIsActive(record) ? 'Hoạt động' : 'Ngừng hoạt động';
    return record.status === 'ACTIVE'
      ? 'Hiệu lực'
      : record.status === 'ENDED'
        ? 'Đã kết thúc'
        : record.active === false
          ? 'Ngưng hoạt động'
          : 'Hoạt động';
  }
  secondary(record: CatalogRecord) {
    return (
      record.phone ||
      String(record['address'] || record['effectiveFrom'] || record['source'] || '—')
    );
  }
  async load(auditPage = 1): Promise<void> {
    const id = ++this.loadId,
      section = this.section;
    this.loading.set(true);
    this.error.set('');
    try {
      if (section === 'audit-logs') {
        const audit = await this.api.audit({
          entityType: this.entityType,
          actorId: this.actorId,
          from: this.from,
          to: this.to,
          page: auditPage,
          limit: 20,
        });
        if (id !== this.loadId) return;
        this.audit = audit;
      } else {
        const rows = await this.api.list<CatalogRecord>(section);
        if (id !== this.loadId) return;
        this.rows.set(rows);
      }
    } catch (error) {
      if (id === this.loadId) {
        this.rows.set([]);
        this.audit = { items: [], page: 1, pages: 1, total: 0, limit: 20 };
        this.error.set(this.api.message(error));
      }
    } finally {
      if (id === this.loadId) this.loading.set(false);
    }
  }
  async edit(record?: CatalogRecord) {
    this.error.set('');
    this.attempted = false;
    try {
      const resource = this.section as CatalogResource;
      const complete = record ? await this.api.detail<CatalogRecord>(resource, record.id) : record;
      const value: Record<string, unknown> = complete || record || {};
      if (resource === 'brokerage-agreements')
        this.roomOptions = await this.api.read('/data/rooms');
      const fields: Record<string, Field[]> = {
        owners: [
          { key: 'fullName', label: 'Họ tên', required: true },
          { key: 'phone', label: 'Điện thoại', type: 'tel', required: true },
          { key: 'note', label: 'Ghi chú' },
        ],
        properties: [
          { key: 'name', label: 'Tên tòa nhà', required: true },
          { key: 'addressLine', label: 'Số nhà, đường', required: true },
          { key: 'ward', label: 'Phường, xã', required: true },
          { key: 'district', label: 'Quận, huyện', required: true },
          { key: 'province', label: 'Tỉnh, thành phố', required: true },
          ...this.geoFields(false),
          {
            key: 'locationStatus',
            label: 'Nguồn tọa độ',
            options: [
              { value: 'estimated', label: 'Tọa độ ước lượng' },
              { value: 'sourced', label: 'Có nguồn đối chiếu' },
              { value: 'pending', label: 'Chưa có tọa độ' },
            ],
          },
          { key: 'locationSource', label: 'Ghi chú nguồn tọa độ' },
        ],
        schools: [
          { key: 'name', label: 'Tên trường', required: true },
          { key: 'campus', label: 'Cơ sở', required: true },
          { key: 'address', label: 'Địa chỉ', required: true },
          ...this.geoFields(true),
          { key: 'source', label: 'Nguồn dữ liệu', required: true },
          { key: 'logoUrl', label: 'Logo trường', type: 'logo' },
        ],
        'work-locations': [
          { key: 'name', label: 'Tên địa điểm', required: true },
          { key: 'address', label: 'Địa chỉ', required: true },
          ...this.geoFields(true),
          {
            key: 'allowedRadiusM',
            label: 'Bán kính cho phép (m)',
            type: 'number',
            required: true,
            min: 1,
          },
        ],
        'brokerage-agreements': [
          {
            key: 'roomId',
            label: 'Phòng',
            required: true,
            options: this.roomOptions.map((room) => ({
              value: room.id,
              label: `${room.code} · ${room.name}`,
            })),
          },
          { key: 'effectiveFrom', label: 'Hiệu lực từ', type: 'date', required: true },
          { key: 'effectiveTo', label: 'Hiệu lực đến (để trống nếu không thời hạn)', type: 'date' },
          {
            key: 'status',
            label: 'Trạng thái',
            options: [
              { value: 'ACTIVE', label: 'Hiệu lực' },
              { value: 'ENDED', label: 'Đã kết thúc' },
            ],
          },
        ],
      };
      this.fields = fields[resource] || [];
      const defaults: Record<string, unknown> = {
        locationStatus: 'estimated',
        source: 'Admin',
        status: 'ACTIVE',
        logoUrl: value['logo'] || '',
      };
      const controls: Record<string, FormControl> = {};
      for (const field of this.fields) {
        const validators = [
          ...(field.required ? [Validators.required] : []),
          ...(field.min !== undefined ? [Validators.min(field.min)] : []),
          ...(field.max !== undefined ? [Validators.max(field.max)] : []),
        ];
        if (field.key === 'phone') validators.push(Validators.pattern(/^(0|\+84)\d{9}$/));
        controls[field.key] = new FormControl(
          value[field.key] ?? defaults[field.key] ?? (field.type === 'number' ? null : ''),
          validators,
        );
      }
      this.form = new FormGroup(controls);
      this.editing = record?.id || null;
      this.detail.set(null);
    } catch (error) {
      this.error.set(this.api.message(error));
    }
  }
  private geoFields(required: boolean): Field[] {
    return [
      { key: 'lat', label: 'Vĩ độ', type: 'number', required, min: -90, max: 90 },
      { key: 'lng', label: 'Kinh độ', type: 'number', required, min: -180, max: 180 },
    ];
  }
  async uploadLogo(event: Event) {
    const input = event.target as HTMLInputElement,
      file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 10 * 1024 * 1024
    ) {
      this.error.set('Chọn ảnh JPG, PNG hoặc WebP tối đa 10 MB.');
      return;
    }
    this.busy.set(true);
    try {
      const result = await firstValueFrom(this.uploads.uploadSchool(file));
      this.form.controls['logoUrl'].setValue(result.url);
      this.error.set('');
    } catch (error) {
      this.error.set(this.api.message(error));
    } finally {
      this.busy.set(false);
    }
  }
  async save() {
    if (this.busy()) return;
    this.attempted = true;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const resource = this.section as CatalogResource,
      value = this.form.getRawValue();
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.save(resource, value, this.editing || undefined);
      this.editing = undefined;
      this.toast.set('Đã lưu ' + this.title.toLocaleLowerCase('vi') + '.');
      await this.updateLocations();
      await this.load();
    } catch (error) {
      this.error.set(this.api.message(error));
    } finally {
      this.busy.set(false);
    }
  }
  confirm(kind: 'delete' | 'deactivate', record: CatalogRecord) {
    this.action = { kind, record };
    this.error.set('');
  }
  async performAction() {
    if (!this.action || this.busy()) return;
    const { kind, record } = this.action,
      resource = this.section as CatalogResource;
    this.busy.set(true);
    this.error.set('');
    try {
      if (kind === 'delete') await this.api.remove(resource, record.id);
      else
        await this.api.deactivate(
          resource,
          record.id,
          resource === 'brokerage-agreements' ? { effectiveTo: this.endDate } : {},
        );
      this.action = undefined;
      this.toast.set(
        kind === 'delete' ? 'Đã xóa bản ghi.' : 'Đã ngưng hoạt động. Lịch sử được giữ nguyên.',
      );
      await this.updateLocations();
      await this.load();
    } catch (error) {
      this.error.set(this.api.message(error));
    } finally {
      this.busy.set(false);
    }
  }
  async showCustomer(record: CatalogRecord) {
    try {
      const detail = await this.api.detail<CatalogRecord>('customers', record.id);
      const identity = detail['identity'] as { number?: string } | undefined;
      if (identity?.number) identity.number = identity.number.replace(/.(?=.{4})/g, '*');
      this.detail.set(detail);
    } catch (error) {
      this.error.set(this.api.message(error));
    }
  }
  identity(record: CatalogRecord) {
    return record['identity'] as
      | {
          number?: string;
          issuedDate?: string;
          issuedPlace?: string;
          frontImage?: string;
          backImage?: string;
        }
      | undefined;
  }
  private async updateLocations() {
    if (!['properties', 'schools'].includes(this.section)) return;
    const [properties, schools, links] = await Promise.all([
      this.api.list<Property>('properties'),
      this.api.list<School>('schools'),
      this.api.read<PropertySchool[]>('/data/property-schools'),
    ]);
    this.locations.setCatalog(properties, schools, links);
  }
}
