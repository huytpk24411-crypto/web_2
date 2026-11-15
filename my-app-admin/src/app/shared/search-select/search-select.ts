import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  inject,
} from '@angular/core';
@Component({
  selector: 'app-search-select',
  standalone: false,
  templateUrl: './search-select.html',
  styleUrls: ['./search-select.css'],
})
export class SearchSelectComponent {
  @Input() label = '';
  @Input() placeholder = 'Tất cả';
  @Input() value = '';
  @Input() options: { value: string; label: string }[] = [];
  @Output() valueChange = new EventEmitter<string>();
  open = false;
  query = '';
  private el = inject(ElementRef);
  get selected() {
    return this.options.find((o) => o.value === this.value)?.label || this.placeholder;
  }
  get matches() {
    const norm = (s: string) =>
      s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/đ/g, 'd');
    return this.options.filter((o) => norm(o.label).includes(norm(this.query)));
  }
  select(value: string) {
    this.valueChange.emit(value);
    this.open = false;
    this.query = '';
    this.el.nativeElement.querySelector('button')?.focus();
  }
  @HostListener('document:click', ['$event']) outside(e: MouseEvent) {
    if (!this.el.nativeElement.contains(e.target)) this.open = false;
  }
  @HostListener('keydown.escape') escape() {
    this.open = false;
    this.el.nativeElement.querySelector('button')?.focus();
  }
}
