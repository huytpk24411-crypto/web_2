import { Injectable, inject } from '@angular/core';
import { DepositDossier } from '../classes/Deposit';
import { MoneyService } from './money-service';
import { MoneyDeposit } from '../classes/Money';
import { BookingHold } from '../classes/Booking';
@Injectable({ providedIn: 'root' })
export class DepositService {
  money = inject(MoneyService);
  private fromApi(d: MoneyDeposit): DepositDossier {
    const payment = this.money
      .payments()
      .find((p) => p.depositId === d.id && p.status === 'CONFIRMED');
    return {
      id: d.id,
      roomId: d.roomId,
      roomSnapshot: d.roomSnapshot,
      customerId: d.customerId,
      customerName: d.customerName || d.customerId,
      phone: d.phone || '',
      total: d.totalRequired,
      holdCredit: d.holdCredit,
      due: d.amountDue,
      bookingId: d.holdId,
      method: d.collected?.method || (payment?.method === 'CASH' ? 'CASH' : 'BANK_TRANSFER'),
      note: d.collected?.note,
      paymentId: payment?.id,
      createdBy: d.employeeId,
      duration: d.proposedLease?.months,
      startDate: d.proposedLease?.startDate,
      apiStatus: d.status,
      contractId: d.contractId,
      status:
        d.status === 'PAYMENT_PENDING'
          ? 'PENDING'
          : d.status === 'CANCELLED'
            ? 'CANCELLED'
            : d.status === 'ABANDONED'
              ? 'FORFEITED'
              : 'CONFIRMED',
    };
  }
  async createRequest(
    data: Pick<
      DepositDossier,
      'roomId' | 'customerName' | 'phone' | 'total' | 'address' | 'duration' | 'startDate'
    > & { collectedMethod: 'CASH' | 'BANK_TRANSFER'; note?: string; draftId?: string },
    bookingId?: string,
  ) {
    const hold = this.money.holds().find((b) => b.id === bookingId);
    const body = {
      roomId: data.roomId,
      customerPhone: data.phone,
      ...(hold ? { customerId: hold.customerId, holdId: hold.id } : {}),
      totalRequired: data.total,
      collectedMethod: data.collectedMethod,
      note: data.note?.trim() || undefined,
      ...(data.draftId ? { draftId: data.draftId } : {}),
      proposedLease: { months: data.duration, startDate: data.startDate },
    };
    const value = await this.money.write<MoneyDeposit>('deposits', body);
    this.money.finishDraft('deposits', body);
    // A6 has succeeded. A failed list refresh must not invite a second deposit submission.
    try {
      await this.money.refresh();
    } catch {
      /* MoneyService exposes the refresh error. */
    }
    return this.fromApi(value);
  }
  list() {
    return this.money.deposits().map((d) => this.fromApi(d));
  }
  get(id: string) {
    return this.list().find((d) => d.id === id);
  }
  eligibleBookings(): BookingHold[] {
    return this.money
      .holds()
      .filter((b) => b.status === 'ACTIVE' && b.isActive)
      .map((b) => ({
        ...b,
        name: b.contact.name,
        phone: b.contact.phone,
        apiStatus: b.status,
        status: 'CONFIRMED',
      }));
  }
}
