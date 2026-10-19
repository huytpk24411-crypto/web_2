import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminRoomService, apiError } from '../../../services/admin-room.service';
import { Room } from '../../../models/domain';
@Component({
  selector: 'app-admin-room-images-frame',
  standalone: false,
  templateUrl: './admin-room-images-frame.component.html',
  styleUrls: ['./admin-room-images-frame.component.css'],
  host: { class: 'room-admin' },
})
export class AdminRoomImagesFrameComponent {
  admin = inject(AdminRoomService);
  route = inject(ActivatedRoute);
  router = inject(Router);
  id = this.route.snapshot.paramMap.get('id') || '';
  images = signal<string[]>([]);
  error = signal('');
  toast = '';
  saving = signal(false);
  preview?: Room;
  constructor() {
    const room = this.admin.get(this.id);
    if (room) this.images.set([...room.images]);
    else this.error.set('Không tìm thấy phòng minh họa.');
  }
  get room() {
    return this.admin.get(this.id);
  }
  showPreview() {
    if (this.room) this.preview = { ...this.room, images: this.images() };
  }
  async save() {
    if (this.saving()) return;
    this.saving.set(true);
    try {
      await this.admin.saveImages(this.id, this.images());
      await this.router.navigate(['/admin/rooms'], { queryParams: { saved: this.id } });
    } catch (error) {
      this.error.set(apiError(error));
    } finally {
      this.saving.set(false);
    }
  }
}
