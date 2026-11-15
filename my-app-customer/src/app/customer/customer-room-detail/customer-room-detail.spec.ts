import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { seedFrameFixture } from '../../testing/frame-fixture';
import { CustomerModule } from '../customer-module';
import { CustomerRoomDetailComponent } from './customer-room-detail';
import { provideZonelessChangeDetection } from '@angular/core';
import { ViewingService } from '../../services/viewing-service';
describe('CustomerRoomDetailComponent', () => {
  let params: BehaviorSubject<{ id: string }>;
  beforeEach(async () => {
    params = new BehaviorSubject({ id: 'phong-48' });
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [CustomerModule],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: {},
              paramMap: convertToParamMap({ id: 'phong-48' }),
              queryParamMap: convertToParamMap({ roomId: 'phong-48' }),
            },
            queryParams: of({}),
            params: params.asObservable(),
          },
        },
      ],
    }).compileComponents();
  });
  it('khởi tạo và render frame bằng HTML', async () => {
    seedFrameFixture('customer', 'customer-room-detail-frame');
    const fixture = TestBed.createComponent(CustomerRoomDetailComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.not-found')).toBeNull();
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.children.length).toBeGreaterThan(0);
  });
  it('hiện tour thật và bỏ thông tin phòng khi API không còn trả phòng', async () => {
    seedFrameFixture('customer', 'customer-room-detail-frame');
    const fixture = TestBed.createComponent(CustomerRoomDetailComponent);
    fixture.detectChanges();
    // The room now loads from /data/rooms/:id; let that promise settle before asserting.
    await new Promise((done) => setTimeout(done));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.tour?.roomId).toBe('phong-48');
    const button: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="room-tour-open"]',
    );
    expect(button?.textContent).toContain('Xem phòng 360°');
    button.click();
    expect(fixture.componentInstance.tourOpen).toBe(true);

    // Change route before rendering the viewer so this button spec does not require WebGL.
    params.next({ id: 'phong-45' });
    await new Promise((done) => setTimeout(done));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.room).toBeUndefined();
    expect(fixture.nativeElement.querySelector('[data-testid="room-tour-open"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('app-room-tour')).toBeNull();
    expect(fixture.componentInstance.tourOpen).toBe(false);
  });
  it('renders the K1 hold action with its icon and removes the process hint', async () => {
    seedFrameFixture('customer', 'customer-room-detail-frame');
    const fixture = TestBed.createComponent(CustomerRoomDetailComponent);
    fixture.detectChanges();
    await new Promise((done) => setTimeout(done));
    await fixture.whenStable();
    const button = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((b) => b.textContent.includes('GIỮ CHỖ NGAY'))!;
    expect(button.textContent.trim()).toBe('GIỮ CHỖ NGAY');
    expect(button.querySelector('app-icon')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Liên hệ để biết quy trình giữ chỗ.');
  });
  it.each([false, true])('render trạng thái thêm giỏ sau await, lỗi=%s', async (failed) => {
    seedFrameFixture('customer', 'customer-room-detail-frame');
    let resolve: () => void;
    let reject: (error: Error) => void;
    const added = new Promise<void>((done, fail) => {
      resolve = done;
      reject = fail;
    });
    vi.spyOn(TestBed.inject(ViewingService), 'addToCart').mockReturnValue(added);
    const fixture = TestBed.createComponent(CustomerRoomDetailComponent);
    fixture.detectChanges();
    // The room now loads from /data/rooms/:id; let that promise settle before asserting.
    await new Promise((done) => setTimeout(done));
    await fixture.whenStable();
    fixture.detectChanges();
    const submit = fixture.componentInstance.addToViewingCart();
    await fixture.whenStable();
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
      'button',
    );
    const adding = Array.from(buttons).find((button) =>
      button.textContent.includes('Đang thêm phòng'),
    )!;
    expect(adding.disabled).toBe(true);
    if (failed) reject!(new Error('Không thêm được phòng'));
    else resolve!();
    await submit;
    await fixture.whenStable();
    expect(fixture.componentInstance.addingToCart()).toBe(false);
    expect(adding.disabled).toBe(false);
    if (failed)
      expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
        'Không thêm được phòng',
      );
    else expect(fixture.nativeElement.textContent).toContain('Đã thêm phòng vào danh sách xem.');
  });
});
