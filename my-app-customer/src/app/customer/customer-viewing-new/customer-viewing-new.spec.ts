import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LOCALE_ID, provideZonelessChangeDetection, signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { CustomerViewingNewComponent } from './customer-viewing-new';
import { CustomerModule } from '../customer-module';
import { ViewingService } from '../../services/viewing-service';
import { RoomService } from '../../services/room-service';
import { AuthService } from '../../services/auth-service';
import { API_ACCOUNT, API_ROOMS } from '../../testing/api-fixtures';
import { Viewing, ViewingAvailability } from '../../classes/Viewing';

const date = '2099-11-17';
const guide = {
  employeeId: 'nv-1',
  employeeCode: 'NV001',
  fullName: 'Nhân viên kiểm thử',
  phone: '0901234568',
};
const viewing = (id = 'viewing-1', canEdit = true): Viewing => ({
  id,
  bookingId: 'dl-1',
  customerId: API_ACCOUNT.id,
  roomIds: ['phong-48'],
  name: API_ACCOUNT.name,
  phone: API_ACCOUNT.phone!,
  at: `${date}T08:00:00+07:00`,
  note: 'Gọi trước',
  status: 'SCHEDULED',
  serverStatus: 'DA_XAC_NHAN',
  canEdit,
  guide,
  roomsInfo: [
    {
      roomId: 'phong-48',
      code: 'PHONG_48',
      name: 'Phòng từ lịch xem',
      address: 'Địa chỉ từ lịch xem',
      price: 4800000,
      image: '/room.jpg',
    },
  ],
});

describe('VIEW-02: đặt và quản lý lịch xem (zoneless)', () => {
  let fixture: ComponentFixture<CustomerViewingNewComponent>;
  let component: CustomerViewingNewComponent;
  let mine: ReturnType<typeof signal<Viewing[]>>;
  let api: {
    getCart: ReturnType<typeof vi.fn>;
    refreshMine: ReturnType<typeof vi.fn>;
    availability: ReturnType<typeof vi.fn>;
    schedule: ReturnType<typeof vi.fn>;
    list: () => Viewing[];
    update: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
  const root = () => fixture.nativeElement as HTMLElement;
  const roomCard = (id = 'phong-48') =>
    root().querySelector<HTMLElement>(`[data-room-id="${id}"]`)!;
  const chip = (time: string, card: HTMLElement = roomCard()) =>
    Array.from(card.querySelectorAll<HTMLButtonElement>('.slot-chip')).find(
      (button) => button.textContent!.trim() === time,
    )!;
  async function choose(id: string, time: string, onDate = date) {
    component.changeDate(id, onDate);
    await fixture.whenStable();
    component.selectTime(id, time);
    await fixture.whenStable();
  }
  beforeEach(async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-15T09:30:00+07:00'));
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    mine = signal<Viewing[]>([]);
    api = {
      getCart: vi.fn().mockResolvedValue(['phong-48', 'phong-49']),
      refreshMine: vi.fn().mockResolvedValue(undefined),
      availability: vi
        .fn()
        .mockImplementation(async (date: string): Promise<ViewingAvailability> => ({
          date,
          slots: [
            '07:00',
            '07:30',
            '08:00',
            '08:30',
            '09:00',
            '09:30',
            '10:00',
            '10:30',
            '13:00',
            '13:30',
            '14:00',
            '14:30',
            '15:00',
            '15:30',
            '16:00',
            '16:30',
          ].map((time) => ({ time, available: true, reason: null })),
        })),
      schedule: vi.fn().mockResolvedValue({ bookingId: 'dl-1', viewings: [viewing()] }),
      list: () => mine(),
      update: vi.fn().mockResolvedValue(viewing()),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    await TestBed.configureTestingModule({
      imports: [CustomerModule],
      providers: [
        provideZonelessChangeDetection(),
        { provide: LOCALE_ID, useValue: 'vi' },
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
        { provide: AuthService, useValue: { account: signal(API_ACCOUNT) } },
        {
          provide: RoomService,
          useValue: {
            rooms: signal(API_ROOMS.filter((r) => r.status === 'AVAILABLE')),
            get: (id: string) => API_ROOMS.find((r) => r.id === id),
          },
        },
        { provide: ViewingService, useValue: api },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(CustomerViewingNewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });
  afterEach(() => {
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it.each([
    ['NO_STAFF', 'Hiện tại chưa có nhân viên trực cho ca này, vui lòng chọn khung giờ khác.'],
    ['MINE', 'Bạn đã có lịch xem khác vào giờ này, vui lòng chọn giờ khác.'],
    ['PAST', 'Giờ này đã qua, vui lòng chọn giờ khác.'],
  ])('chip %s có aria-disabled, hiện đúng câu và không chọn', async (reason, expectedMessage) => {
    api.availability.mockResolvedValue({
      date,
      slots: [{ time: '08:00', available: false, reason }],
    });
    component.changeDate('phong-48', date);
    await fixture.whenStable();
    const button = chip('08:00');
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    button.click();
    await fixture.whenStable();
    expect(component.choice('phong-48').startTime).toBe('');
    expect(roomCard().querySelector('[role="alert"]')!.textContent).toContain(expectedMessage);
    roomCard().querySelector<HTMLButtonElement>('.dismiss')!.click();
    await fixture.whenStable();
    expect(roomCard().querySelector('[role="alert"]')).toBeNull();
  });

  it('giữ thứ tự tick, chặn hai phòng cùng ngày giờ và mở lại khi đổi ngày/bỏ tick', async () => {
    await choose('phong-48', '08:00');
    component.changeDate('phong-49', date);
    await fixture.whenStable();
    chip('08:00', roomCard('phong-49')).click();
    await fixture.whenStable();
    expect(component.choice('phong-49').startTime).toBe('');
    expect(roomCard('phong-49').textContent).toContain(component.reasonMessages.MINE);
    expect(api.availability).toHaveBeenCalledTimes(1);
    await choose('phong-49', '08:00', '2099-11-18');
    expect(component.choice('phong-49').startTime).toBe('08:00');
    component.changeDate('phong-49', date);
    expect(component.choice('phong-49').startTime).toBe('');
    component.toggle('phong-48');
    component.selectTime('phong-49', '08:00');
    expect(component.choice('phong-49').startTime).toBe('08:00');
    component.toggle('phong-48');
    expect(component.selected()).toEqual(['phong-49', 'phong-48']);
  });

  it('đang tải A1 không chọn chip, cache theo ngày và có thể thử lại khi lỗi', async () => {
    let resolve!: (value: ViewingAvailability) => void;
    api.availability.mockReturnValueOnce(
      new Promise<ViewingAvailability>((done) => {
        resolve = done;
      }),
    );
    component.changeDate('phong-48', date);
    await fixture.whenStable();
    expect(roomCard().querySelector('[aria-busy="true"]')).not.toBeNull();
    chip('08:00').click();
    expect(component.choice('phong-48').startTime).toBe('');
    resolve({ date, slots: [{ time: '08:00', available: true, reason: null }] });
    await fixture.whenStable();
    await choose('phong-48', '08:00');
    expect(api.availability).toHaveBeenCalledTimes(1);
    api.availability.mockRejectedValueOnce(new Error('Mất kết nối'));
    await component.loadAvailability(date, '', true);
    await fixture.whenStable();
    expect(roomCard().textContent).toContain('Mất kết nối');
    expect(roomCard().textContent).toContain('Thử lại');
  });

  it('bỏ phản hồi A1 cũ khi cache đã được nạp lại sau thay đổi', async () => {
    let resolve!: (value: ViewingAvailability) => void;
    api.availability.mockReturnValueOnce(
      new Promise<ViewingAvailability>((done) => {
        resolve = done;
      }),
    );
    component.changeDate('phong-48', date);
    await component.refreshAvailability();
    resolve({ date, slots: [{ time: '08:00', available: false, reason: 'NO_STAFF' }] });
    await fixture.whenStable();
    expect(component.slotReason(date, '08:00', 'phong-48')).toBeNull();
    expect(api.availability).toHaveBeenCalledTimes(2);
  });

  it('kiểm tra lại giờ Việt Nam khi form mở qua giờ hẹn', async () => {
    await choose('phong-48', '10:00', '2026-11-15');
    component.toggle('phong-49');
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-11-15T10:00:01+07:00'));
    await component.submit();
    await fixture.whenStable();
    expect(roomCard().textContent).toContain('Giờ này đã qua, vui lòng chọn giờ khác.');
    expect(api.schedule).not.toHaveBeenCalled();
  });

  it('báo lỗi tại từng thẻ thiếu ngày/giờ và không checkout', async () => {
    await component.submit();
    await fixture.whenStable();
    expect(root().querySelectorAll('[data-room-id] [role="alert"]').length).toBe(2);
    expect(api.schedule).not.toHaveBeenCalled();
    expect(roomCard().querySelector<HTMLInputElement>('[type="date"]')!.min).toBe('2026-11-15');
    expect(root().querySelector('select')).toBeNull();
  });

  it('gửi đúng items, thay form bằng thành công, có hai nút + guide và tiếp tục giữ liên hệ', async () => {
    await choose('phong-48', '08:00');
    await choose('phong-49', '13:30');
    component.form.controls.note.setValue('Gọi trước');
    api.schedule.mockResolvedValueOnce({
      bookingId: 'dl-1',
      viewings: [viewing(), { ...viewing('viewing-2'), roomIds: ['phong-49'], roomsInfo: [] }],
    });
    await component.submit();
    await fixture.whenStable();
    expect(api.schedule).toHaveBeenCalledWith({
      viewerName: API_ACCOUNT.name,
      viewerPhone: API_ACCOUNT.phone,
      peopleCount: 1,
      note: 'Gọi trước',
      items: [
        { roomId: 'phong-48', date, startTime: '08:00' },
        { roomId: 'phong-49', date, startTime: '13:30' },
      ],
    });
    expect(root().querySelector('.split form')).toBeNull();
    expect(root().querySelector('.step-strip .done:last-child b')!.textContent).toBe('✓');
    const success = root().querySelector('.booking-success')!;
    expect(success.querySelectorAll('.scheduled-card').length).toBe(2);
    expect(success.textContent).toContain('Đặt lịch xem phòng thành công!');
    expect(success.textContent).toContain(guide.fullName);
    expect(success.textContent).toContain(guide.employeeCode);
    expect(success.querySelector('.viewing-guide a')!.getAttribute('href')).toBe(
      'tel:' + guide.phone,
    );
    expect(success.querySelector('.success-actions')!.textContent).toContain(
      'Tiếp tục đặt lịch xem',
    );
    expect(success.querySelector('.success-actions a')!.getAttribute('href')).toBe('/rooms');
    api.getCart.mockResolvedValueOnce([]);
    success.querySelector<HTMLButtonElement>('.success-actions button')!.click();
    await fixture.whenStable();
    expect(component.success()).toBeNull();
    expect(component.selected()).toEqual([]);
    expect(component.form.getRawValue()).toEqual({
      name: API_ACCOUNT.name,
      phone: API_ACCOUNT.phone,
      note: '',
    });
    expect(component.choices()).toEqual({});
  });

  it('guide null hiện lời chờ trên màn hình thành công', async () => {
    component.success.set({ bookingId: 'dl-1', viewings: [{ ...viewing(), guide: null }] });
    await fixture.whenStable();
    expect(root().querySelector('.viewing-guide')!.textContent).toContain('Đang đợi người hỗ trợ.');
  });

  it('tuần chưa chốt: chọn được giờ và hiện gợi ý người hỗ trợ sẽ hiện sau', async () => {
    api.availability.mockImplementation(async (d: string): Promise<ViewingAvailability> => ({
      date: d,
      slots: [
        '07:00',
        '07:30',
        '08:00',
        '08:30',
        '09:00',
        '09:30',
        '10:00',
        '10:30',
        '13:00',
        '13:30',
        '14:00',
        '14:30',
        '15:00',
        '15:30',
        '16:00',
        '16:30',
      ].map((time) => ({ time, available: true, reason: null, pendingGuide: true })),
    }));
    await choose('phong-48', '08:00', '2099-12-01');
    expect(component.choice('phong-48').startTime).toBe('08:00');
    expect(roomCard().querySelector('.pending-guide-hint')!.textContent).toContain(
      'Tuần này chưa chốt lịch trực',
    );
  });

  it.each([true, false])(
    '409 đặt lịch hiện message server tại đúng vùng, roomId=%s, nạp lại A1',
    async (withRoom) => {
      await choose('phong-48', '08:00');
      await choose('phong-49', '13:00');
      api.schedule.mockRejectedValueOnce(
        Object.assign(new Error('Thông báo tranh chấp từ máy chủ'), {
          status: 409,
          roomId: withRoom ? 'phong-49' : undefined,
        }),
      );
      await component.submit();
      await fixture.whenStable();
      expect(withRoom ? roomCard('phong-49').textContent : component.error()).toContain(
        'Thông báo tranh chấp từ máy chủ',
      );
      expect(api.availability).toHaveBeenCalledTimes(2);
      expect(component.success()).toBeNull();
    },
  );

  it('danh sách chia thời gian, đúng thứ tự; chỉ canEdit có Sửa/Xóa', async () => {
    mine.set([
      viewing('later'),
      { ...viewing('earlier', false), at: '2099-11-16T08:00:00+07:00' },
      { ...viewing('past', false), at: '2026-11-14T08:00:00+07:00', serverStatus: 'DA_XEM' },
      { ...viewing('older', false), at: '2026-11-13T08:00:00+07:00', serverStatus: 'DA_HUY' },
    ]);
    await fixture.whenStable();
    expect(component.visibleViewings().map((v) => v.id)).toEqual(['earlier', 'later']);
    const rows = root().querySelectorAll('.viewing-row');
    expect(rows[0].textContent).not.toContain('Sửa');
    expect(rows[0].textContent).not.toContain('Xóa');
    expect(rows[0].textContent).toContain('Chi tiết');
    expect(rows[1].textContent).toContain('Sửa');
    expect(rows[1].textContent).toContain('Xóa');
    expect(root().textContent).not.toContain('Hủy lịch');
    component.tab.set('past');
    await fixture.whenStable();
    expect(component.visibleViewings().map((v) => v.id)).toEqual(['past', 'older']);
    expect(root().textContent).toContain('Đã xem');
    expect(root().textContent).toContain('Đã hủy');
  });

  it('chi tiết có đầy đủ phòng/người xem/nhân viên; Esc đóng và trả focus', async () => {
    mine.set([viewing()]);
    await fixture.whenStable();
    const opener = root().querySelector<HTMLButtonElement>('.row-actions button')!;
    opener.focus();
    opener.click();
    await fixture.whenStable();
    const modal = root().querySelector<HTMLElement>('[role="dialog"]')!;
    for (const value of [
      'viewing-1',
      'Đã xác nhận',
      'PHONG_48',
      'Phòng từ lịch xem',
      'Địa chỉ từ lịch xem',
      API_ACCOUNT.name,
      API_ACCOUNT.phone!,
      'Gọi trước',
      guide.fullName,
      guide.employeeCode,
      guide.phone,
    ])
      expect(modal.textContent).toContain(value);
    expect(modal.querySelector(`a[href="tel:${guide.phone}"]`)).not.toBeNull();
    expect(modal.querySelector('img')!.getAttribute('src')).toBe('/room.jpg');
    expect(modal.textContent).toContain('4.800.000');
    modal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(root().querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('sửa dùng excludeViewingId, chọn giờ hiện tại, gửi đúng body và thông báo đổi guide', async () => {
    const original = viewing();
    component.openDialog('edit', original);
    await fixture.whenStable();
    expect(api.availability).toHaveBeenCalledWith(date, original.id);
    const modal = root().querySelector<HTMLElement>('[role="dialog"]')!;
    expect(chip('08:00', modal).getAttribute('aria-pressed')).toBe('true');
    chip('08:30', modal).click();
    component.editNote.set('Ghi chú đã sửa');
    api.update.mockResolvedValueOnce({
      ...original,
      guide: { ...guide, employeeId: 'nv-2', fullName: 'Nhân viên mới' },
    });
    await component.saveEdit();
    await fixture.whenStable();
    expect(api.update).toHaveBeenCalledWith(original.id, {
      date,
      startTime: '08:30',
      note: 'Ghi chú đã sửa',
    });
    expect(component.dialog()).toBeNull();
    expect(component.message()).toContain(
      'Đã cập nhật lịch xem. Nhân viên hướng dẫn mới: Nhân viên mới – ' + guide.phone + '.',
    );
    expect(api.refreshMine).toHaveBeenCalledTimes(2);
  });

  it('lỗi sửa ở lại hộp thoại, 409 tải lại A1 với exclude', async () => {
    component.openDialog('edit', viewing());
    await fixture.whenStable();
    api.update.mockRejectedValueOnce(
      Object.assign(new Error('Giờ vừa hết nhân viên'), { status: 409 }),
    );
    await component.saveEdit();
    await fixture.whenStable();
    expect(root().querySelector('[role="dialog"]')!.textContent).toContain('Giờ vừa hết nhân viên');
    expect(api.availability).toHaveBeenCalledTimes(2);
  });

  it('xóa chỉ sau xác nhận; Không/bấm nền/× đóng; xóa xong tải lại lịch và A1', async () => {
    await choose('phong-48', '08:00');
    component.openDialog('delete', viewing());
    await fixture.whenStable();
    expect(api.remove).not.toHaveBeenCalled();
    const modal = root().querySelector('[role="dialog"]')!;
    expect(modal.textContent).toContain(
      'Lịch sẽ bị xóa hẳn và nhân viên hướng dẫn sẽ được thông báo.',
    );
    modal.querySelector<HTMLButtonElement>('.actions button:last-child')!.click();
    await fixture.whenStable();
    expect(component.dialog()).toBeNull();
    component.openDialog('delete', viewing());
    await fixture.whenStable();
    root().querySelector<HTMLDivElement>('.modal-backdrop')!.click();
    await fixture.whenStable();
    expect(component.dialog()).toBeNull();
    component.openDialog('delete', viewing());
    await fixture.whenStable();
    root().querySelector<HTMLButtonElement>('.modal .close')!.click();
    await fixture.whenStable();
    expect(api.remove).not.toHaveBeenCalled();
    component.openDialog('delete', viewing());
    await fixture.whenStable();
    root().querySelector<HTMLButtonElement>('.modal .danger')!.click();
    await fixture.whenStable();
    expect(api.remove).toHaveBeenCalledWith('viewing-1');
    expect(component.dialog()).toBeNull();
    expect(component.message()).toBe('Đã xóa lịch xem.');
    expect(api.refreshMine).toHaveBeenCalledTimes(2);
    expect(api.availability).toHaveBeenCalledTimes(2);
  });
});
