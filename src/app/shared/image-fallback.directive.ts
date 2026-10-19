import { Directive, HostListener, ElementRef, inject } from '@angular/core';
@Directive({ selector: 'img[appImageFallback]', standalone: false })
export class ImageFallbackDirective {
  private el = inject(ElementRef<HTMLImageElement>);
  @HostListener('error') error() {
    const img = this.el.nativeElement;
    if (!img.src.endsWith('/assets/room-placeholder.svg')) img.src = '/assets/room-placeholder.svg';
  }
}
