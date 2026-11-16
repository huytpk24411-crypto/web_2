import { Component, computed, input } from '@angular/core';
import { DepositSheet } from '../../classes/DepositSheet';
import { vietnameseMoney } from '../../shared/vietnamese-money';

@Component({
  selector: 'app-deposit-sheet',
  standalone: false,
  templateUrl: './deposit-sheet.html',
  styleUrls: ['./deposit-sheet.css'],
})
export class DepositSheetComponent {
  readonly sheet = input.required<DepositSheet>();
  readonly amountWords = computed(() => vietnameseMoney(this.sheet().deposit.collected.amount));
}
