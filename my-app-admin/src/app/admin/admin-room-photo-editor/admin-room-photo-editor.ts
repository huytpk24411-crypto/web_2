import { Component, EventEmitter, inject, Input, Output, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { UploadAPIService } from '../../services/upload-apiservice';
import { apiMessage } from '../../services/api-message';

@Component({
  selector: 'app-admin-room-photo-editor',
  standalone: false,
  templateUrl: './admin-room-photo-editor.html',
  styleUrls: ['./admin-room-photo-editor.css'],
  host: { class: 'room-admin' },
})
export class AdminRoomPhotoEditorComponent {
  private uploads = inject(UploadAPIService);
  @Input() urls: string[] = [];
  @Input() compact = false;
  @Output() urlsChange = new EventEmitter<string[]>();
  @Output() message = new EventEmitter<string>();
  readonly error = signal('');
  readonly busy = signal(false);
  selectedImage = '';
  dragIndex = -1;
  async upload(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    input.value = '';
    await this.addFiles(files);
  }
  async addFiles(files: File[]) {
    if (this.busy() || !files.length) return;
    if (files.length + this.urls.length > 15) {
      this.error.set('Mỗi phòng được lưu tối đa 15 ảnh.');
      return;
    }
    if (
      files.some(
        (file) =>
          !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
          file.size > 10 * 1024 * 1024,
      )
    ) {
      this.error.set('Chỉ nhận JPG, PNG hoặc WebP, tối đa 10 MB mỗi ảnh.');
      return;
    }
    this.busy.set(true);
    try {
      const urls = await Promise.all(
        files.map(async (file) => {
          const result = await firstValueFrom(this.uploads.uploadRoom(file));
          if (!result.url) throw new Error('Máy chủ chưa trả URL ảnh.');
          return result.url;
        }),
      );
      this.urlsChange.emit([...new Set([...this.urls, ...urls])]);
      this.error.set('');
      this.message.emit('Đã thêm ảnh từ thiết bị. Bấm lưu để giữ thay đổi.');
    } catch (error) {
      this.error.set(apiMessage(error, 'Không tải được ảnh. Vui lòng thử lại.'));
    } finally {
      this.busy.set(false);
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
