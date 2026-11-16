import { Component } from '@angular/core';

@Component({
  selector: 'app-customer-footer',
  standalone: false,
  templateUrl: './customer-footer.html',
  styleUrls: ['./customer-footer.css'],
})
export class CustomerFooterComponent {
  readonly year = new Date().getFullYear();
}
