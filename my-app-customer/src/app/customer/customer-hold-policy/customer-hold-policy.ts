import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-customer-hold-policy',
  standalone: false,
  templateUrl: './customer-hold-policy.html',
  styleUrls: ['./customer-hold-policy.css'],
})
export class CustomerHoldPolicyComponent {
  @Input() roomName = '';
  @Output() accepted = new EventEmitter<void>();
  @Output() declined = new EventEmitter<void>();
  agreed = false;
}
