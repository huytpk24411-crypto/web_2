import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { AdminRoomPhotoEditorComponent } from '../admin/admin-room-photo-editor/admin-room-photo-editor';
import { UploadAPIService } from './upload-apiservice';
import { AdminModule } from '../admin/admin-module';

describe('Image uploads', () => {
  let http: HttpTestingController;
  const file = new File(['image'], 'image.png', { type: 'image/png' });
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideZonelessChangeDetection(),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('renders busy and upload errors after await in zoneless mode', async () => {
    const fixture = TestBed.createComponent(AdminRoomPhotoEditorComponent);
    fixture.detectChanges();
    const upload = fixture.componentInstance.addFiles([file]);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[type="file"]').disabled).toBe(true);
    http.expectOne('/api/upload/rooms').flush('{}', { status: 413, statusText: 'Too large' });
    await upload;
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[type="file"]').disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Không tải được ảnh',
    );
  });
  it('uploads employee avatars as FormData and returns the server URL', () => {
    const result = vi.fn();
    TestBed.inject(UploadAPIService).uploadEmployee(file).subscribe(result);
    const request = http.expectOne('/api/upload/employees');
    expect(request.request.method).toBe('POST');
    expect(request.request.body.get('file')).toBe(file);
    expect(request.request.headers.has('Content-Type')).toBe(false);
    request.flush('{"url":"/uploads/employees/image.png"}');
    expect(result).toHaveBeenCalledWith({ url: '/uploads/employees/image.png' });
  });
  it('uses the server URL in the photo editor', async () => {
    const editor = TestBed.runInInjectionContext(() => new AdminRoomPhotoEditorComponent());
    const changed = vi.fn();
    editor.urlsChange.subscribe(changed);
    const upload = editor.addFiles([file]);
    http.expectOne('/api/upload/rooms').flush('{"url":"/uploads/rooms/image.png"}');
    await upload;
    expect(changed).toHaveBeenCalledWith(['/uploads/rooms/image.png']);
    expect(editor.busy()).toBe(false);
  });
  it.each([0, 413, 500])('retains the gallery on upload failure %s', async (status) => {
    const editor = TestBed.runInInjectionContext(() => new AdminRoomPhotoEditorComponent());
    editor.urls = ['/uploads/rooms/original.png'];
    const changed = vi.fn();
    editor.urlsChange.subscribe(changed);
    const upload = editor.addFiles([file]);
    const request = http.expectOne('/api/upload/rooms');
    if (!status) request.error(new ProgressEvent('error'));
    else request.flush('{}', { status, statusText: 'Failure' });
    await upload;
    expect(changed).not.toHaveBeenCalled();
    expect(editor.urls).toEqual(['/uploads/rooms/original.png']);
    expect(editor.error()).toContain(
      status === 413 ? 'Không tải được ảnh' : 'Không kết nối được máy chủ',
    );
  });
});
