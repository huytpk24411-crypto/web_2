import { Injectable, inject } from '@angular/core';
import { MoneyService } from './money-service';
import { BrokerageDeal } from '../classes/Deal';
@Injectable({ providedIn: 'root' })
export class DealService {
  private display(
    record: { number: string; customerName?: string; phone?: string },
    deposit?: { customerName?: string; phone?: string },
  ) {
    return {
      number: record.number || 'Chưa cấp số',
      customerName: record.customerName || deposit?.customerName || 'Chưa có tên khách hàng',
      phone: record.phone || deposit?.phone || '',
    };
  }
  money = inject(MoneyService);
  async createContract(depositId: string, startDate: string, endDate: string, monthlyRent: number) {
    const body = { depositId, startDate, endDate, monthlyRent };
    const contract = await this.money.write<{ id: string }>('contracts', body);
    await this.money.refresh();
    this.money.finishDraft('contracts', body);
    return contract;
  }
  async sign(id: string) {
    await this.money.write('contracts/' + id + '/sign', {});
    await this.money.refresh();
  }
  list(): EmployeeDeal[] {
    const contracts = this.money.contracts();
    const contracted = new Set(contracts.map((c) => c.depositId));
    return [
      ...contracts.map((c): EmployeeDeal => ({
        id: c.id,
        depositId: c.depositId,
        roomId: c.roomId,
        roomSnapshot: c.roomSnapshot,
        ...this.display(
          c,
          this.money.deposits().find((d) => d.id === c.depositId),
        ),
        brokerageFee: this.money.transactions().find((t) => t.contractId === c.id)?.finalFee || 0,
        apiStatus: c.status,
        statusLabel: this.money.label(c.status),
        status:
          c.status === 'COMPLETED'
            ? 'COMPLETED'
            : c.status === 'VOID' || c.status === 'CANCELLED'
              ? 'FORFEITED'
              : 'PENDING',
        forfeitureReason: this.money.deposits().find((d) => d.id === c.depositId)?.abandonment
          ?.reason,
        forfeitedAt: this.money.deposits().find((d) => d.id === c.depositId)?.abandonment
          ?.recordedAt,
      })),
      ...this.money
        .deposits()
        .filter((d) => !contracted.has(d.id))
        .map((d): EmployeeDeal => ({
          id: d.id,
          depositId: d.id,
          roomId: d.roomId,
          roomSnapshot: d.roomSnapshot,
          ...this.display(d),
          brokerageFee: 0,
          apiStatus: d.status,
          statusLabel:
            d.status === 'ABANDONED'
              ? 'Khách bỏ cọc – hợp đồng không hiệu lực'
              : d.status === 'PAID' || d.status === 'CONTRACTED'
                ? 'Chưa lập hợp đồng'
                : this.money.label(d.status),
          status:
            d.status === 'ABANDONED'
              ? 'FORFEITED'
              : d.status === 'COMPLETED'
                ? 'COMPLETED'
                : d.status === 'CANCELLED'
                  ? 'CANCELLED'
                  : 'PENDING',
          forfeitureReason: d.abandonment?.reason,
          forfeitedAt: d.abandonment?.recordedAt,
        })),
    ];
  }
  get(id: string) {
    return this.list().find((d) => d.id === id);
  }
}

export interface EmployeeDeal extends BrokerageDeal {
  number: string;
  phone: string;
  statusLabel: string;
}
