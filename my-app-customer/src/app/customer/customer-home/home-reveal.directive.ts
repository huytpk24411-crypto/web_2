import { AfterViewInit, Directive, ElementRef, OnDestroy, inject } from '@angular/core';

/** Content stays visible when observers or animation support are unavailable. */
@Directive({ selector: '[appHomeReveal]', standalone: false })
export class HomeRevealDirective implements AfterViewInit, OnDestroy {
  private element = inject(ElementRef<HTMLElement>);
  private observer?: IntersectionObserver;
  private motion?: MediaQueryList;
  private reveal = () => {
    this.element.nativeElement.classList.remove('reveal-pending');
    this.observer?.disconnect();
  };
  private motionChange = () => {
    if (this.motion?.matches) this.reveal();
  };
  ngAfterViewInit() {
    this.motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (this.motion.matches || typeof IntersectionObserver === 'undefined') return;
    const element = this.element.nativeElement;
    if (element.getBoundingClientRect().top < window.innerHeight) return;
    this.observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.15) this.reveal();
      },
      { threshold: 0.15 },
    );
    this.observer.observe(element);
    element.classList.add('reveal-pending');
    this.motion.addEventListener('change', this.motionChange);
  }
  ngOnDestroy() {
    this.observer?.disconnect();
    this.motion?.removeEventListener('change', this.motionChange);
  }
}
