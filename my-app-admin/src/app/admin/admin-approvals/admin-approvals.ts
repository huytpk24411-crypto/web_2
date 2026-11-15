import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import {
  ContractReview,
  ContractReviewOutcome,
  ContractReviewState,
} from '../../classes/ContractReview';
import { apiMessage } from '../../services/api-message';
import { ContractReviewAPIService } from '../../services/contract-review-apiservice';

type DialogType = 'approve' | 'abandon' | 'detail';

@Component({
  selector: 'app-admin-approvals',
  standalone: false,
  templateUrl: './admin-approvals.html',
  styleUrls: ['../admin-finance-ui.css', './admin-approvals.css'],
})
export class AdminApprovalsComponent implements OnInit, OnDestroy {
  private readonly api = inject(ContractReviewAPIService);
  private generation = 0;
  readonly tab = signal<ContractReviewState>('pending');
  readonly pending = signal<ContractReview[]>([]);
  readonly done = signal<ContractReview[]>([]);
  readonly search = signal('');
  readonly outcome = signal<'all' | Exclude<ContractReviewOutcome, 'PENDING'>>('all');
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly toast = signal('');
  readonly loadError = signal('');
  readonly error = signal('');
  readonly note = signal('');
  readonly dialog = signal<{ type: DialogType; item: ContractReview } | null>(null);
  readonly visible = computed(() => {
    const query = this.search().trim().toLocaleLowerCase('vi');
    const rows = this.tab() === 'pending' ? this.pending() : this.done();
    return rows.filter(
      (item) =>
        (this.tab() === 'pending' || this.outcome() === 'all' || item.outcome === this.outcome()) &&
        [
          item.contract?.number,
          item.room?.code,
          item.customer?.name,
          item.employee?.fullName,
          item.employee?.employeeCode,
        ]
          .join(' ')
          .toLocaleLowerCase('vi')
          .includes(query),
    );
  });
  readonly detail = computed(() => {
    const item = this.dialog()?.item;
    if (!item) return [];
    const contract = item.contract;
    const room = item.room;
    const fees = { ...room?.fees, ...contract?.fees };
    const otherFees = Object.entries(fees)
      .filter(([key]) => !['electricity', 'water', 'service'].includes(key))
      .map(([name, value]) => `${name}: ${this.money(value)}`);
    return [
      ['Số hợp đồng', this.contractNumber(item)],
      ['Trạng thái hợp đồng', this.contractStatus(item)],
      ['Ngày lập hợp đồng', this.date(contract?.createdAt || contract?.createdOn)],
      ['Ngày ký hợp đồng', this.date(contract?.signedAt)],
      ['Thời hạn từ', this.date(contract?.startDate || item.deposit.proposedLease?.startDate)],
      ['Thời hạn đến', this.date(contract?.endDate)],
      [
        'Giá thuê/tháng',
        this.money(
          contract?.monthlyRent ?? item.deposit.proposedLease?.monthlyRent ?? room?.monthlyRent,
        ),
      ],
      [
        'Điện',
        this.money(contract?.electricityPrice ?? room?.electricityPrice ?? fees['electricity']),
      ],
      ['Nước', this.money(contract?.waterPrice ?? room?.waterPrice ?? fees['water'])],
      ['Phí dịch vụ', this.money(contract?.serviceFee ?? room?.serviceFee ?? fees['service'])],
      ['Phí khác', otherFees.join('\n') || '—'],
      ['Tiền cọc', this.money(item.amounts.total)],
      ['Phần công ty (50%)', this.money(item.amounts.companyShare)],
      ['Phần chủ nhà (50%)', this.money(item.amounts.ownerShare)],
      ['Tiền giữ chỗ đã trừ', this.money(item.amounts.holdCredit)],
      ['Khách hàng', item.customer?.name || '—'],
      ['SĐT khách hàng', item.customer?.phone || '—'],
      ['CCCD (đã che)', item.customer?.identityMasked || '—'],
      ['Mã phòng', room?.code || '—'],
      ['Tên phòng', room?.name || '—'],
      ['Tòa', room?.propertyName || '—'],
      ['Địa chỉ', room?.address || '—'],
      ['Chủ nhà', item.owner?.name || '—'],
      ['SĐT chủ nhà', item.owner?.phone || '—'],
      [
        'Nhân viên lập',
        [item.employee?.fullName, item.employee?.employeeCode].filter(Boolean).join(' · ') || '—',
      ],
      ['Số hồ sơ cọc', item.deposit.number || '—'],
      ['Ngày lập cọc', this.date(item.depositAt)],
      ['Số ngày từ lúc lập cọc', `${item.daysSinceDeposit} ngày`],
      ['Kết quả', this.outcomeLabel(item)],
      [
        'Người xác nhận',
        typeof item.decidedBy === 'string'
          ? item.decidedBy
          : item.decidedBy?.fullName || item.decidedBy?.name || item.decidedBy?.id || '—',
      ],
      ['Thời gian xác nhận', this.date(item.decidedAt, true)],
      ['Ghi chú', item.note || '—'],
    ];
  });

  ngOnInit() {
    void this.reload();
  }
  ngOnDestroy() {
    this.generation++;
  }

  async reload() {
    const generation = ++this.generation;
    this.loading.set(true);
    this.loadError.set('');
    try {
      const [pending, done] = await Promise.all([this.api.list('pending'), this.api.list('done')]);
      if (generation !== this.generation) return;
      this.pending.set(pending);
      this.done.set(done);
    } catch (error) {
      if (generation !== this.generation) return;
      this.pending.set([]);
      this.done.set([]);
      this.loadError.set(apiMessage(error, 'Không tải được danh sách hợp đồng. Vui lòng thử lại.'));
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }

  contractNumber(item: ContractReview) {
    return item.contract?.number || 'Chưa lập hợp đồng';
  }

  contractStatus(item: ContractReview) {
    const labels: Record<string, string> = {
      DRAFT: 'Nháp',
      SIGNED: 'Đã ký – chờ admin xác nhận',
      COMPLETED: 'Thành công',
      VOID: 'Không hiệu lực – khách bỏ cọc',
      CANCELLED: 'Đã hủy',
    };
    return item.contract
      ? labels[item.contract.status] || item.contract.status
      : 'Chưa lập hợp đồng';
  }

  outcomeLabel(item: ContractReview) {
    return item.outcome === 'SUCCESS'
      ? 'Thành công'
      : item.outcome === 'ABANDONED'
        ? 'Khách bỏ cọc'
        : 'Chưa xác nhận';
  }

  canApprove(item: ContractReview) {
    return item.contract?.status === 'SIGNED';
  }

  isPending(item: ContractReview) {
    return (
      !['SUCCESS', 'ABANDONED'].includes(item.outcome) &&
      ['PAID', 'CONTRACTED'].includes(item.deposit.status)
    );
  }

  money(value?: number | string) {
    if (value == null || value === '') return '—';
    const number = Number(value);
    return Number.isFinite(number) ? `${number.toLocaleString('vi-VN')} đ` : String(value);
  }

  date(value?: string, time = false) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    const day = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
    return time
      ? `${day} ${new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Ho_Chi_Minh',
          hour: '2-digit',
          minute: '2-digit',
        }).format(date)}`
      : day;
  }

  open(type: DialogType, item: ContractReview) {
    if (
      this.busy() ||
      (type !== 'detail' && (!this.isPending(item) || this.loading())) ||
      (type === 'approve' && !this.canApprove(item))
    )
      return;
    this.error.set('');
    this.note.set('');
    this.dialog.set({ type, item });
  }

  close() {
    if (!this.busy()) this.dialog.set(null);
  }

  async confirm() {
    const current = this.dialog();
    if (!current || current.type === 'detail' || this.busy() || !this.isPending(current.item))
      return;
    if (current.type === 'approve' && !this.canApprove(current.item)) {
      this.error.set('Hợp đồng chưa ký.');
      return;
    }
    if (current.type === 'abandon' && this.note().length > 500) {
      this.error.set('Ghi chú tối đa 500 ký tự.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.toast.set('');
    try {
      if (current.type === 'approve') await this.api.approve(current.item.deposit.id);
      else await this.api.abandon(current.item.deposit.id, this.note().trim());
      this.dialog.set(null);
      this.toast.set(
        current.type === 'approve' ? 'Đã duyệt hợp đồng.' : 'Đã ghi nhận khách bỏ cọc.',
      );
      await this.reload();
    } catch (error) {
      this.error.set(apiMessage(error, 'Không thực hiện được yêu cầu. Vui lòng thử lại.'));
    } finally {
      this.busy.set(false);
    }
  }
}
