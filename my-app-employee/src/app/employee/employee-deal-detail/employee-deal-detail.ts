import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { DealService } from '../../services/deal-service';
import { DepositService } from '../../services/deposit-service';
import { RoomService } from '../../services/room-service';
@Component({
  selector: 'app-employee-direct-deal-frame',
  standalone: false,
  templateUrl: './employee-deal-detail.html',
  styleUrls: ['./employee-deal-detail.css'],
})
export class EmployeeDealDetailComponent {
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
  get abandonedDeposits() {
    return this.deposits.money.deposits().filter((d) => d.status === 'ABANDONED');
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
      if (this.paidDeposits.some((d) => d.id === this.id)) this.chooseDeposit(this.id);
    } catch (e) {
      this.error = (e as Error).message;
    }
  }
  chooseDeposit(id: string) {
    const deposit = this.paidDeposits.find((d) => d.id === id);
    if (!deposit || this.busy) return;
    this.contractDepositId = id;
    this.contractStart = deposit?.proposedLease?.startDate || '';
    this.contractRent =
      deposit?.proposedLease?.monthlyRent || this.rooms.get(deposit?.roomId || '')?.price || 0;
    this.contractEnd = '';
  }
  async createContract() {
    if (this.busy || !this.paidDeposits.some((d) => d.id === this.contractDepositId)) return;
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
      await this.deals.sign(this.id);
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
      this.contractDepositId = '';
      if (this.paidDeposits.some((d) => d.id === this.id)) this.chooseDeposit(this.id);
      this.error = '';
    });
  }
  get deal() {
    return this.deals.get(this.id);
  }
  get contract() {
    return this.deals.money.contracts().find((c) => c.id === this.id);
  }
  get room() {
    return this.rooms.forRecord(this.deal);
  }
  get deposit() {
    return this.deposits.get(this.deal?.depositId || '');
  }
  get pending() {
    return this.deals.list().filter((d) => d.status === 'PENDING').length;
  }
  get completed() {
    return this.deals.list().filter((d) => d.status === 'COMPLETED').length;
  }
  get forfeited() {
    return this.deals.list().filter((d) => d.status === 'FORFEITED').length;
  }
  search = '';
  project = '';
  month = '';
  get contractCards() {
    return this.deals.list().map((deal) => ({
      deal,
      room: this.rooms.forRecord(deal),
      deposit: this.deposits.get(deal.depositId || ''),
    }));
  }
  get projects() {
    return [
      ...new Set(
        this.contractCards
          .map((card) => card.room?.propertyName)
          .filter((name): name is string => !!name),
      ),
    ];
  }
  get visibleCards() {
    const query = this.search.trim().toLocaleLowerCase('vi');
    return this.contractCards.filter(
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
