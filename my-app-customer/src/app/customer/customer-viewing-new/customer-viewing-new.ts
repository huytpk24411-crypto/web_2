import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth-service';
import { RoomService } from '../../services/room-service';
import { isViewingShiftTime, ViewingService } from '../../services/viewing-service';
import { PHONE_PATTERN } from '../../shared/validators';
import { apiMessage } from '../../services/api-message';
import {
  Viewing,
  ViewingAvailability,
  ViewingRoomInfo,
  ViewingSlotReason,
} from '../../classes/Viewing';

interface TimeChoice {
  date: string;
  startTime: string;
  error: string;
}
interface AvailabilityState {
  loading: boolean;
  data?: ViewingAvailability;
  error: string;
}
interface ViewingDialog {
  kind: 'detail' | 'edit' | 'delete';
  viewing: Viewing;
}
const emptyChoice = (): TimeChoice => ({ date: '', startTime: '', error: '' });

@Component({
  selector: 'app-customer-viewing-schedule-frame',
  standalone: false,
  templateUrl: './customer-viewing-new.html',
  styleUrls: ['./customer-viewing-new.css'],
})
export class CustomerViewingNewComponent {
  readonly rooms = inject(RoomService);
  readonly viewings = inject(ViewingService);
  readonly auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);
  readonly selected = signal<string[]>([]);
  readonly choices = signal<Record<string, TimeChoice>>({});
  readonly error = signal('');
  readonly success = signal<{ bookingId: string; viewings: Viewing[] } | null>(null);
  readonly loadingCart = signal(true);
  readonly submitting = signal(false);
  readonly loadingMine = signal(false);
  readonly historyError = signal('');
  readonly message = signal('');
  readonly tab = signal<'upcoming' | 'past'>('upcoming');
  readonly clock = signal(Date.now());
  readonly dialog = signal<ViewingDialog | null>(null);
  readonly editChoice = signal<TimeChoice>(emptyChoice());
  readonly editNote = signal('');
  readonly modalError = signal('');
  readonly saving = signal(false);
  readonly cache = signal<Record<string, AvailabilityState>>({});
  readonly formTouched = signal(false);
  readonly form = this.fb.nonNullable.group({
    name: [this.auth.account()?.name || '', Validators.required],
    phone: [
      this.auth.account()?.phone || '',
      [Validators.required, Validators.pattern(PHONE_PATTERN)],
    ],
    note: ['', Validators.maxLength(1000)],
  });
  readonly formValue = signal(this.form.getRawValue());
  readonly formInvalid = computed(() => {
    this.formValue();
    return this.form.invalid;
  });
  readonly available = computed(() => this.rooms.rooms().filter((r) => r.status === 'AVAILABLE'));
  readonly selectedRooms = computed(() =>
    this.selected()
      .map((id) => this.rooms.get(id))
      .filter((r) => !!r),
  );
  readonly firstRoom = computed(() => this.rooms.get(this.selected()[0]));
  readonly visibleViewings = computed(() =>
    this.viewings
      .list()
      .filter((v) => Date.parse(v.at) > this.clock() === (this.tab() === 'upcoming'))
      .sort((a, b) => (Date.parse(a.at) - Date.parse(b.at)) * (this.tab() === 'upcoming' ? 1 : -1)),
  );
  readonly timeGroups = [
    {
      label: 'Sáng',
      times: ['07:00', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30'],
    },
    {
      label: 'Chiều',
      times: ['13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'],
    },
  ];
  readonly reasonMessages: Record<ViewingSlotReason, string> = {
    NO_STAFF: 'Hiện tại chưa có nhân viên trực cho ca này, vui lòng chọn khung giờ khác.',
    MINE: 'Bạn đã có lịch xem khác vào giờ này, vui lòng chọn giờ khác.',
    PAST: 'Giờ này đã qua, vui lòng chọn giờ khác.',
  };
  get today(): string {
    return new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  }

  constructor() {
    const timer = setInterval(() => this.clock.set(Date.now()), 30000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
    this.form.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.formValue.set(this.form.getRawValue()));
    const id = this.route.snapshot.queryParamMap.get('roomId');
    if (id && this.rooms.get(id)?.status === 'AVAILABLE') this.selected.set([id]);
    void this.loadCart();
    void this.loadMine();
  }
  async loadMine() {
    this.loadingMine.set(true);
    this.historyError.set('');
    try {
      await this.viewings.refreshMine();
      this.clock.set(Date.now());
    } catch (error) {
      this.historyError.set(apiMessage(error, 'Không tải được lịch xem. Vui lòng thử lại.'));
    } finally {
      this.loadingMine.set(false);
    }
  }
  async loadCart() {
    this.loadingCart.set(true);
    try {
      const cart = await this.viewings.getCart();
      this.selected.update((selected) =>
        [...new Set([...selected, ...cart])].filter((id) => !!this.rooms.get(id)),
      );
    } catch (error) {
      this.error.set(apiMessage(error, 'Không tải được danh sách xem. Vui lòng thử lại.'));
    } finally {
      this.loadingCart.set(false);
    }
  }
  toggle(id: string) {
    if (this.submitting() || this.loadingCart()) return;
    this.selected.update((selected) =>
      selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id],
    );
    this.choices.update((choices) => {
      const next = { ...choices };
      delete next[id];
      return next;
    });
  }
  choice(id: string): TimeChoice {
    return this.choices()[id] ?? emptyChoice();
  }
  private key(date: string, exclude = '') {
    return `${date}|${exclude}`;
  }
  availabilityState(date: string, exclude = '') {
    return this.cache()[this.key(date, exclude)];
  }
  private validDate(date: string) {
    return (
      /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && date >= this.today
    );
  }
  async loadAvailability(date: string, exclude = '', retry = false) {
    if (!this.validDate(date)) return;
    const key = this.key(date, exclude);
    if (this.cache()[key] && !retry) return;
    const request: AvailabilityState = { loading: true, error: '' };
    this.cache.update((cache) => ({ ...cache, [key]: request }));
    try {
      const data = await this.viewings.availability(date, exclude || undefined);
      if (this.cache()[key] === request)
        this.cache.update((cache) => ({ ...cache, [key]: { loading: false, error: '', data } }));
    } catch (error) {
      if (this.cache()[key] === request)
        this.cache.update((cache) => ({
          ...cache,
          [key]: {
            loading: false,
            error: apiMessage(error, 'Không tải được khung giờ. Vui lòng thử lại.'),
          },
        }));
    }
  }
  async refreshAvailability() {
    this.cache.set({});
    const dates = [
      ...new Set(
        this.selected()
          .map((id) => this.choice(id).date)
          .filter(Boolean),
      ),
    ];
    const edit = this.dialog();
    await Promise.all([
      ...dates.map((date) => this.loadAvailability(date)),
      ...(edit?.kind === 'edit'
        ? [this.loadAvailability(this.editChoice().date, edit.viewing.id)]
        : []),
    ]);
  }
  changeDate(id: string, date: string) {
    this.choices.update((choices) => ({
      ...choices,
      [id]: {
        date,
        startTime: '',
        error: this.validDate(date) ? '' : 'Vui lòng chọn ngày từ hôm nay.',
      },
    }));
    void this.loadAvailability(date);
  }
  changeEditDate(date: string) {
    this.editChoice.set({ date, startTime: '', error: '' });
    void this.loadAvailability(date, this.dialog()?.viewing.id);
  }
  slotReason(date: string, time: string, roomId = '', exclude = ''): ViewingSlotReason | null {
    const slot = this.availabilityState(date, exclude)?.data?.slots.find(
      (slot) => slot.time === time,
    );
    if ((date && Date.parse(`${date}T${time}:00+07:00`) <= Date.now()) || slot?.reason === 'PAST')
      return 'PAST';
    if (
      !exclude &&
      this.selected().some(
        (id) =>
          id !== roomId && this.choice(id).date === date && this.choice(id).startTime === time,
      )
    )
      return 'MINE';
    return slot && !slot.available ? (slot.reason ?? 'NO_STAFF') : null;
  }
  /** Chosen slot lies in a week whose duty roster is not finalized yet. */
  slotPendingGuide(date: string, time: string, exclude = ''): boolean {
    return !!this.availabilityState(date, exclude)?.data?.slots.find((slot) => slot.time === time)
      ?.pendingGuide;
  }
  slotUnavailable(date: string, time: string, roomId = '', exclude = '') {
    return (
      this.saving() ||
      this.submitting() ||
      !this.availabilityState(date, exclude)?.data ||
      !!this.slotReason(date, time, roomId, exclude)
    );
  }
  selectTime(id: string, time: string, edit = false) {
    if (this.saving() || this.submitting()) return;
    const choice = edit ? this.editChoice() : this.choice(id);
    const exclude = edit ? this.dialog()?.viewing.id || '' : '';
    const reason = this.slotReason(choice.date, time, id, exclude);
    const state = this.availabilityState(choice.date, exclude);
    const error = reason
      ? this.reasonMessages[reason]
      : !choice.date
        ? 'Vui lòng chọn ngày xem.'
        : !state?.data
          ? state?.error || 'Đang tải khung giờ, vui lòng chờ.'
          : '';
    const next = { ...choice, startTime: error ? choice.startTime : time, error };
    if (edit) this.editChoice.set(next);
    else this.choices.update((choices) => ({ ...choices, [id]: next }));
  }
  clearChoiceError(id: string) {
    this.choices.update((choices) => ({ ...choices, [id]: { ...this.choice(id), error: '' } }));
  }
  private choiceError(choice: TimeChoice, id: string, exclude = ''): string {
    if (!this.validDate(choice.date)) return 'Vui lòng chọn ngày xem từ hôm nay.';
    if (!choice.startTime) return 'Vui lòng chọn giờ xem phòng.';
    if (!isViewingShiftTime(choice.startTime)) return 'Vui lòng chọn một khung giờ trong ca.';
    const reason = this.slotReason(choice.date, choice.startTime, id, exclude);
    if (reason) return this.reasonMessages[reason];
    const state = this.availabilityState(choice.date, exclude);
    return state?.data ? '' : state?.error || 'Vui lòng chờ tải khung giờ.';
  }
  async submit() {
    if (this.loadingCart() || this.submitting() || this.success()) return;
    this.form.markAllAsTouched();
    this.formTouched.set(true);
    this.error.set('');
    let invalid = false;
    for (const id of this.selected()) {
      const error = this.choiceError(this.choice(id), id);
      if (error) invalid = true;
      this.choices.update((choices) => ({ ...choices, [id]: { ...this.choice(id), error } }));
    }
    if (!this.selected().length) this.error.set('Vui lòng chọn ít nhất một phòng muốn xem.');
    if (this.form.invalid || invalid || !this.selected().length) return;
    this.submitting.set(true);
    try {
      const { name, phone, note } = this.form.getRawValue();
      const result = await this.viewings.schedule({
        viewerName: name,
        viewerPhone: phone,
        peopleCount: 1,
        note,
        items: this.selected().map((roomId) => ({
          roomId,
          date: this.choice(roomId).date,
          startTime: this.choice(roomId).startTime,
        })),
      });
      this.success.set(result);
      window.scrollTo({ top: 0, behavior: 'instant' });
      await Promise.all([this.loadMine(), this.refreshAvailability()]);
    } catch (error) {
      const conflict = error as { status?: number; roomId?: string };
      const message = apiMessage(error, 'Không đặt được lịch xem. Vui lòng thử lại.');
      if (conflict.roomId && this.selected().includes(conflict.roomId)) {
        const id = conflict.roomId;
        this.choices.update((choices) => ({
          ...choices,
          [id]: { ...this.choice(id), error: message },
        }));
      } else this.error.set(message);
      if (conflict.status === 409) await this.refreshAvailability();
    } finally {
      this.submitting.set(false);
    }
  }
  async continueBooking() {
    this.success.set(null);
    this.selected.set([]);
    this.choices.set({});
    this.error.set('');
    this.form.controls.note.setValue('');
    this.form.markAsUntouched();
    this.formTouched.set(false);
    this.cache.set({});
    await this.loadCart();
  }
  roomInfo(viewing: Viewing): ViewingRoomInfo[] {
    return viewing.roomIds.map((roomId) => {
      const info = viewing.roomsInfo?.find((room) => room.roomId === roomId);
      const room = this.rooms.get(roomId);
      const snapshot = viewing.roomSnapshots?.[roomId];
      return (
        info ?? {
          roomId,
          code: room?.code ?? snapshot?.code ?? roomId,
          name: room?.name ?? snapshot?.name ?? '',
          address: room?.address ?? snapshot?.address ?? '',
          price: room?.price ?? snapshot?.monthlyRent ?? null,
          image: room?.images[0] ?? '',
        }
      );
    });
  }
  statusBadge(viewing: Viewing): string {
    const statuses: Record<string, string> = {
      DA_XAC_NHAN: 'CONFIRMED',
      CHO_XAC_NHAN: 'PENDING',
      DA_XEM: 'DONE',
      DA_HUY: 'CANCELLED',
    };
    return statuses[viewing.serverStatus || ''] || viewing.status;
  }
  formatAt(at: string): string {
    const date = new Date(at);
    const day = new Intl.DateTimeFormat('vi-VN', {
      weekday: 'long',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(date);
    const time = new Intl.DateTimeFormat('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(date);
    const calendar = new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(date);
    return `${time} · ${day.charAt(0).toUpperCase() + day.slice(1)} ${calendar}`;
  }
  openDialog(kind: ViewingDialog['kind'], viewing: Viewing) {
    if (kind !== 'detail' && !viewing.canEdit) return;
    this.modalError.set('');
    this.dialog.set({ kind, viewing });
    if (kind === 'edit') {
      const local = new Date(Date.parse(viewing.at) + 7 * 3600000).toISOString();
      this.editChoice.set({ date: local.slice(0, 10), startTime: local.slice(11, 16), error: '' });
      this.editNote.set(viewing.note);
      void this.loadAvailability(this.editChoice().date, viewing.id);
    }
  }
  closeDialog() {
    if (!this.saving()) this.dialog.set(null);
  }
  clearEditError() {
    this.editChoice.update((choice) => ({ ...choice, error: '' }));
  }
  async saveEdit() {
    const dialog = this.dialog();
    if (dialog?.kind !== 'edit' || this.saving()) return;
    const choice = this.editChoice();
    const error = this.choiceError(choice, '', dialog.viewing.id);
    this.editChoice.update((choice) => ({ ...choice, error }));
    if (error) return;
    if (this.editNote().length > 1000) {
      this.modalError.set('Ghi chú không được vượt quá 1000 ký tự.');
      return;
    }
    this.saving.set(true);
    this.modalError.set('');
    this.message.set('');
    try {
      const updated = await this.viewings.update(dialog.viewing.id, {
        date: choice.date,
        startTime: choice.startTime,
        note: this.editNote(),
      });
      const changed =
        updated.guide && updated.guide.employeeId !== dialog.viewing.guide?.employeeId;
      this.message.set(
        'Đã cập nhật lịch xem.' +
          (changed
            ? ` Nhân viên hướng dẫn mới: ${updated.guide!.fullName} – ${updated.guide!.phone}.`
            : ''),
      );
      this.dialog.set(null);
      await Promise.all([this.loadMine(), this.refreshAvailability()]);
    } catch (error) {
      this.modalError.set(apiMessage(error, 'Không cập nhật được lịch xem. Vui lòng thử lại.'));
      if ((error as { status?: number }).status === 409) await this.refreshAvailability();
    } finally {
      this.saving.set(false);
    }
  }
  async deleteViewing() {
    const dialog = this.dialog();
    if (dialog?.kind !== 'delete' || this.saving()) return;
    this.saving.set(true);
    this.modalError.set('');
    this.message.set('');
    try {
      await this.viewings.remove(dialog.viewing.id);
      this.dialog.set(null);
      this.message.set('Đã xóa lịch xem.');
      await Promise.all([this.loadMine(), this.refreshAvailability()]);
    } catch (error) {
      this.modalError.set(apiMessage(error, 'Không xóa được lịch xem. Vui lòng thử lại.'));
    } finally {
      this.saving.set(false);
    }
  }
}
