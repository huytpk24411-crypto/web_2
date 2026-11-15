import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-brand',
  standalone: false,
  templateUrl: './brand.html',
  styleUrls: ['./brand.css'],
})
export class BrandComponent {
  @Input() home = '/';
  @Input() admin = false;
  @Input() compact = false;
}
