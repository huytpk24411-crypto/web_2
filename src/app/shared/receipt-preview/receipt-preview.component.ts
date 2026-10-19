import { Component, inject, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-receipt-preview',
  standalone: false,
  templateUrl: './receipt-preview.component.html',
  styleUrls: ['./receipt-preview.component.css'],
})
export class ReceiptPreviewComponent {
  @Input() title = 'PHIẾU GIỮ CHỖ PHÒNG';
  @Input() reference = '';
  @Input() name = '';
  @Input() roomCode = '';
  @Input() amount = 0;
  @Input() confirmed = false;
  @Input() paymentId = '';
  @Input() date = '';
  print() {
    window.print();
  }
}
