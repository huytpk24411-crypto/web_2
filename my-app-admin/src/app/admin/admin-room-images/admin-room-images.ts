import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Room } from '../../classes/Room';
import { AdminRoomService, apiError } from '../../services/admin-room-service';

@Component({
  selector: 'app-admin-room-images-frame',
  standalone: false,
  templateUrl: './admin-room-images.html',
  styleUrls: ['./admin-room-images.css'],
  host: { class: 'room-admin' },
})
export class AdminRoomImagesComponent {
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
    void this.admin
      .getFromApi(this.id)
      .then((room) => this.images.set([...room.images]))
      .catch((error) => this.error.set(apiError(error)));
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
