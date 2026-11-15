import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-receipt-preview',
  standalone: false,
  templateUrl: './receipt-preview.html',
  styleUrls: ['./receipt-preview.css'],
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
