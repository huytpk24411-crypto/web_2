import { Component, inject, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-brand',
  standalone: false,
  templateUrl: './brand.component.html',
  styleUrls: ['./brand.component.css'],
})
export class BrandComponent {
  @Input() admin = false;
  @Input() compact = false;
}
