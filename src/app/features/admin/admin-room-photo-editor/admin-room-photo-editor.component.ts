import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ROOM_MEDIA } from '../../../data/room-media';
import { readRoomImage } from '../../../services/admin-room.service';
@Component({
  selector: 'app-admin-room-photo-editor',
  standalone: false,
  templateUrl: './admin-room-photo-editor.component.html',
  styleUrls: ['./admin-room-photo-editor.component.css'],
  host: { class: 'room-admin' },
})
export class AdminRoomPhotoEditorComponent {
  @Input() urls: string[] = [];
  @Input() compact = false;
  @Output() urlsChange = new EventEmitter<string[]>();
  @Output() message = new EventEmitter<string>();
  error = '';
  busy = false;
  selectedImage = '';
  dragIndex = -1;
  readonly samples = [...new Set(Object.values(ROOM_MEDIA).flat())];
  addSamples() {
    const images = this.samples
      .filter((url) => !this.urls.includes(url))
      .slice(0, Math.min(3, 15 - this.urls.length));
    if (!images.length) {
      this.error = 'Thư viện đã đủ 15 ảnh.';
      return;
    }
    this.error = '';
    this.urlsChange.emit([...this.urls, ...images]);
    this.message.emit('Đã thêm ' + images.length + ' ảnh mẫu. Bấm lưu để giữ thay đổi.');
  }
  async upload(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    input.value = '';
    await this.addFiles(files);
  }
  async addFiles(files: File[]) {
    if (this.busy || !files.length) return;
    if (files.length + this.urls.length > 15) {
      this.error = 'Mỗi phòng được lưu tối đa 15 ảnh.';
      return;
    }
    if (
      files.some(
        (file) =>
          !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
          file.size > 10 * 1024 * 1024,
      )
    ) {
      this.error = 'Chỉ nhận JPG, PNG hoặc WebP, tối đa 10 MB mỗi ảnh.';
      return;
    }
    this.busy = true;
    try {
      const urls = await Promise.all(files.map((file) => readRoomImage(file)));
      this.urlsChange.emit([...new Set([...this.urls, ...urls])]);
      this.error = '';
      this.message.emit('Đã đọc ảnh từ thiết bị. Bấm lưu để giữ thay đổi.');
    } catch {
      this.error = 'Không đọc được ảnh. Vui lòng thử lại.';
    } finally {
      this.busy = false;
    }
  }
  uploadDrop(event: DragEvent) {
    event.preventDefault();
    void this.addFiles(Array.from(event.dataTransfer?.files || []));
  }
  move(index: number, to: number) {
    if (to < 0 || to >= this.urls.length) return;
    const urls = [...this.urls];
    const [item] = urls.splice(index, 1);
    urls.splice(to, 0, item);
    this.urlsChange.emit(urls);
  }
  drop(event: DragEvent, index: number) {
    event.preventDefault();
    event.stopPropagation();
    if (this.dragIndex >= 0) this.move(this.dragIndex, index);
    this.dragIndex = -1;
  }
  remove(index: number) {
    this.urlsChange.emit(this.urls.filter((_, i) => i !== index));
    this.message.emit('Đã bỏ ảnh khỏi danh sách chỉnh sửa. Bấm lưu để áp dụng.');
  }
  filename(url: string, index: number) {
    return url.startsWith('data:')
      ? 'Ảnh từ thiết bị ' + (index + 1)
      : url.split('/').pop() || 'Ảnh phòng';
  }
}
