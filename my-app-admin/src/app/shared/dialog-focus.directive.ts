import {
  AfterViewInit,
  Directive,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
} from '@angular/core';
@Directive({ selector: '[appDialogFocus]', standalone: false })
export class DialogFocusDirective implements AfterViewInit, OnDestroy {
  private host: ElementRef<HTMLElement> = inject(ElementRef);
  private previous = document.activeElement as HTMLElement | null;
  ngAfterViewInit() {
    queueMicrotask(() => this.focusable()[0]?.focus());
  }
  private focusable() {
    return Array.from(
      this.host.nativeElement.querySelectorAll<HTMLElement>(
        'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
      ),
    );
  }
  @HostListener('keydown', ['$event']) keydown(event: KeyboardEvent) {
    if (event.key !== 'Tab') return;
    const items = this.focusable(),
      first = items[0],
      last = items[items.length - 1];
    if (!first) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  ngOnDestroy() {
    this.previous?.focus();
  }
}
