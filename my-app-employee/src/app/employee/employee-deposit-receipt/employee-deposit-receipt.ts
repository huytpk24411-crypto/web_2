import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DepositSheet } from '../../classes/DepositSheet';
import { DepositDocumentService } from '../../services/deposit-document-service';
import { vietnameseMoney } from '../../shared/vietnamese-money';

@Component({
  selector: 'app-employee-deposit-receipt',
  standalone: false,
  templateUrl: './employee-deposit-receipt.html',
  styleUrls: ['./employee-deposit-receipt.css'],
})
export class EmployeeDepositReceiptComponent {
  private route = inject(ActivatedRoute);
  private documents = inject(DepositDocumentService);
  readonly sheet = signal<DepositSheet | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly amountWords = computed(() => {
    const sheet = this.sheet();
    return sheet ? vietnameseMoney(sheet.deposit.collected.amount) : '';
  });
  private version = 0;
  constructor() {
    this.route.params.pipe(takeUntilDestroyed()).subscribe(() => void this.load());
  }
  async load() {
    const id = this.route.snapshot.paramMap.get('id'),
      version = ++this.version;
    this.sheet.set(null);
    this.error.set('');
    if (!id) {
      this.error.set('Không tìm thấy mã hồ sơ cọc.');
      return;
    }
    this.loading.set(true);
    try {
      const sheet = await this.documents.sheet(id);
      if (version === this.version) this.sheet.set(sheet);
    } catch (e) {
      if (version === this.version) this.error.set((e as Error).message);
    } finally {
      if (version === this.version) this.loading.set(false);
    }
  }
  print() {
    if (this.sheet()) window.print();
  }
}
