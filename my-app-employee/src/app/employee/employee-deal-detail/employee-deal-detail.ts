import {
  Component,
  ElementRef,
  Injector,
  ViewChild,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { DealService, EmployeeDeal } from '../../services/deal-service';
import { DepositService } from '../../services/deposit-service';
import { RoomService } from '../../services/room-service';
import { depositLeaseEnd } from '../../shared/vietnamese-money';
@Component({
  selector: 'app-employee-direct-deal-frame',
  standalone: false,
  templateUrl: './employee-deal-detail.html',
  styleUrls: ['./employee-deal-detail.css'],
})
export class EmployeeDealDetailComponent {
  private readonly injector = inject(Injector);
  @ViewChild('contractEntry', { read: ElementRef })
  private contractEntry?: ElementRef<HTMLFormElement>;
  deals = inject(DealService);
  deposits = inject(DepositService);
  rooms = inject(RoomService);
  route = inject(ActivatedRoute);
  router = inject(Router);
  private selectedId = signal('');
  get id() {
    return this.selectedId();
  }
  set id(value: string) {
    this.selectedId.set(value);
  }
  private _error = signal('');
  get error() {
    return this._error();
  }
  set error(value: ReturnType<typeof this._error>) {
    this._error.set(value);
  }
  private _toast = signal('');
  get toast() {
    return this._toast();
  }
  set toast(value: ReturnType<typeof this._toast>) {
    this._toast.set(value);
  }
  private _busy = signal(false);
  get busy() {
    return this._busy();
  }
  set busy(value: ReturnType<typeof this._busy>) {
    this._busy.set(value);
  }
  private readonly selectedDepositId = signal('');
  get contractDepositId() {
    return this.selectedDepositId();
  }
  set contractDepositId(value: string) {
    this.selectedDepositId.set(value);
  }
  contractStart = '';
  contractEnd = '';
  contractRent = 0;
  listScope: 'contracts' | 'deposits' = 'contracts';
  selectScope(scope: 'contracts' | 'deposits') {
    if (scope !== this.listScope) {
      this.search = '';
      this.project = '';
      this.month = '';
    }
    this.listScope = scope;
  }
  get ownContractIds() {
    return new Set(this.deals.money.contracts().map((contract) => contract.id));
  }
  get contractSummary() {
    const contracts = this.deals.money.contracts();
    return {
      total: contracts.length,
      approved: contracts.filter((c) => c.status === 'COMPLETED').length,
      pending: contracts.filter((c) => c.status === 'SIGNED').length,
      abandoned: contracts.filter((c) => c.status === 'VOID').length,
    };
  }
  get depositSummary() {
    const deposits = this.deals.money.deposits();
    const linked = new Set(this.deals.money.contracts().map((c) => c.depositId));
    const contracted = deposits.filter((d) => linked.has(d.id)).length;
    return { total: deposits.length, contracted, uncontracted: deposits.length - contracted };
  }
  private restoreSelection() {
    if (this.deals.money.deposits().some((d) => d.id === this.id)) {
      this.selectScope('deposits');
      if (this.paidDeposits.some((d) => d.id === this.id)) this.chooseDeposit(this.id);
    }
  }
  get paidDeposits() {
    const contracted = new Set(this.deals.money.contracts().map((c) => c.depositId));
    return this.deposits.money
      .deposits()
      .filter((d) => d.status === 'PAID' && !contracted.has(d.id));
  }
  async refresh() {
    try {
      await this.deals.money.refresh();
      this.restoreSelection();
    } catch (e) {
      this.error = (e as Error).message;
    }
  }
  chooseDeposit(id: string) {
    const deposit = this.paidDeposits.find((d) => d.id === id);
    if (!deposit || this.busy) return;
    this.contractDepositId = id;
    this.selectScope('deposits');
    this.contractStart = deposit?.proposedLease?.startDate || '';
    this.contractRent =
      deposit?.proposedLease?.monthlyRent || this.rooms.get(deposit?.roomId || '')?.price || 0;
    this.contractEnd = depositLeaseEnd(this.contractStart, deposit.proposedLease?.months ?? 0);
    this.error = '';
    afterNextRender(
      () => {
        const form = this.contractEntry?.nativeElement;
        form?.scrollIntoView?.({ block: 'center' });
        form?.querySelector('input')?.focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
  }
  async createContract() {
    if (this.busy || !this.paidDeposits.some((d) => d.id === this.contractDepositId)) return;
    if (
      !depositLeaseEnd(this.contractStart, 1) ||
      !depositLeaseEnd(this.contractEnd, 1) ||
      this.contractEnd <= this.contractStart
    ) {
      this.error =
        'Vui lòng nhập ngày bắt đầu và ngày kết thúc hợp đồng hợp lệ. Ngày kết thúc phải sau ngày bắt đầu.';
      return;
    }
    this.busy = true;
    try {
      const contract = await this.deals.createContract(
        this.contractDepositId,
        this.contractStart,
        this.contractEnd,
        this.contractRent,
      );
      this.contractDepositId = '';
      this.error = '';
      await this.router.navigate(['/employee/deals', contract.id]);
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.busy = false;
    }
  }
  async sign() {
    if (this.busy || this.contract?.status !== 'DRAFT') return;
    this.busy = true;
    try {
      await this.deals.sign(this.contract.id);
      await this.rooms.refresh();
      this.error = '';
      this.toast = 'Đã ký – chờ admin xác nhận';
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.busy = false;
    }
  }
  constructor() {
    void this.refresh();
    this.route.params.pipe(takeUntilDestroyed()).subscribe((p) => {
      this.id = p['id'] || '';
      this.selectScope(
        this.deals.money.deposits().some((d) => d.id === this.id) ? 'deposits' : 'contracts',
      );
      this.contractDepositId = '';
      this.restoreSelection();
      this.error = '';
    });
  }
  get deal() {
    return this.currentCards.find((card) => card.deal.id === this.id)?.deal;
  }
  get contract() {
    return this.deals.money.contracts().find((c) => c.id === this.id || c.depositId === this.id);
  }
  get room() {
    return this.rooms.forRecord(this.deal);
  }
  get deposit() {
    return this.deposits.get(this.deal?.depositId || '');
  }
  search = '';
  project = '';
  month = '';
  get contractCards() {
    const ids = this.ownContractIds;
    return this.deals
      .list()
      .filter((deal) => ids.has(deal.id))
      .map((deal) => ({
        deal,
        room: this.rooms.forRecord(deal),
        deposit: this.deposits.get(deal.depositId || ''),
      }));
  }
  get depositCards() {
    const contracted = new Set(this.deals.money.contracts().map((c) => c.depositId));
    return this.deposits.money.deposits().map((record) => {
      const deal: EmployeeDeal = {
        id: record.id,
        depositId: record.id,
        roomId: record.roomId,
        roomSnapshot: record.roomSnapshot,
        number: record.number,
        customerName: record.customerName || 'Chưa có tên khách hàng',
        phone: record.phone || '',
        brokerageFee: 0,
        apiStatus: record.status,
        statusLabel:
          record.status === 'PAID' && !contracted.has(record.id)
            ? 'Chưa lập hợp đồng'
            : this.deals.money.label(record.status),
        status:
          record.status === 'COMPLETED'
            ? 'COMPLETED'
            : record.status === 'ABANDONED'
              ? 'FORFEITED'
              : record.status === 'CANCELLED'
                ? 'CANCELLED'
                : 'PENDING',
        forfeitureReason: record.abandonment?.reason,
        forfeitedAt: record.abandonment?.recordedAt,
      };
      return { deal, room: this.rooms.forRecord(deal), deposit: this.deposits.get(record.id) };
    });
  }
  get currentCards() {
    return this.listScope === 'contracts' ? this.contractCards : this.depositCards;
  }
  get projects() {
    return [
      ...new Set(
        this.currentCards
          .map((card) => card.room?.propertyName)
          .filter((name): name is string => !!name),
      ),
    ];
  }
  get visibleCards() {
    const query = this.search.trim().toLocaleLowerCase('vi');
    return this.currentCards.filter(
      ({ deal, room, deposit }) =>
        (!query ||
          [deal.number, deal.customerName, room?.code, room?.name, deal.phone]
            .join(' ')
            .toLocaleLowerCase('vi')
            .includes(query)) &&
        (!this.project || room?.propertyName === this.project) &&
        (!this.month || deposit?.startDate?.slice(0, 7) === this.month),
    );
  }
  print() {
    window.print();
  }
}
