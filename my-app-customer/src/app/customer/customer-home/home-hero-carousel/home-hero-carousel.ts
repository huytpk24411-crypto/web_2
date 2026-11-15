import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  inject,
  signal,
} from '@angular/core';
import { Room } from '../../../classes/Room';
import { LocationService } from '../../../services/location-service';

@Component({
  selector: 'app-home-hero-carousel',
  standalone: false,
  templateUrl: './home-hero-carousel.html',
  styleUrls: ['./home-hero-carousel.css'],
})
export class HomeHeroCarouselComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() rooms: Room[] = [];
  @Input() loading = false;
  @Input() formActive = false;
  locations = inject(LocationService);
  private element = inject(ElementRef<HTMLElement>);
  readonly active = signal(0);
  readonly requested = signal(0);
  readonly loaded = signal<Set<number>>(new Set());
  readonly running = signal(false);
  readonly stopped = signal(false);
  readonly reduced = signal(false);
  readonly announcement = signal('');
  readonly cycle = signal(0);
  readonly zoom = signal(false);
  readonly moving = signal(false);
  readonly previous = signal<number | null>(null);
  readonly direction = signal<'next' | 'previous'>('next');
  private hovering = false;
  private inView = true;
  private requestedDirection: 'next' | 'previous' = 'next';
  private manualRequest = false;
  private timer?: ReturnType<typeof setTimeout>;
  private transitionTimer?: ReturnType<typeof setTimeout>;
  private observer?: IntersectionObserver;
  private motion?: MediaQueryList;
  private roomKey = '';
  private visibility = () => this.syncPlayback();
  private motionChange = () => {
    this.reduced.set(!!this.motion?.matches);
    if (this.reduced()) {
      this.zoom.set(false);
      if (this.moving()) this.finishTransition();
    }
    this.syncPlayback();
  };

  ngOnChanges() {
    const key = this.rooms.map((r) => r.id + ':' + r.images[0]).join('|');
    if (key !== this.roomKey) {
      this.roomKey = key;
      clearTimeout(this.transitionTimer);
      this.moving.set(false);
      this.previous.set(null);
      this.direction.set('next');
      this.requestedDirection = 'next';
      this.active.set(0);
      this.requested.set(0);
      this.loaded.set(new Set());
      this.zoom.set(false);
      this.manualRequest = false;
    }
    this.syncPlayback();
  }
  ngAfterViewInit() {
    this.motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reduced.set(this.motion.matches);
    this.motion.addEventListener('change', this.motionChange);
    document.addEventListener('visibilitychange', this.visibility);
    if (typeof IntersectionObserver !== 'undefined') {
      this.observer = new IntersectionObserver(
        ([entry]) => {
          this.inView = entry.isIntersecting;
          this.syncPlayback();
        },
        { threshold: 0 },
      );
      this.observer.observe(this.element.nativeElement);
    }
    this.syncPlayback();
  }
  imageLoaded(index: number) {
    this.loaded.update((values) => new Set([...values, index]));
    if (index === this.active() && !this.reduced()) this.zoom.set(true);
    this.commitTarget();
    this.syncPlayback();
  }
  imageFailed(event: Event, index: number) {
    const img = event.target as HTMLImageElement;
    if (!img.src.endsWith('/assets/placeholders/room-placeholder.svg'))
      img.src = '/assets/placeholders/room-placeholder.svg';
    else this.imageLoaded(index);
  }
  hover(value: boolean) {
    this.hovering = value;
    this.syncPlayback();
  }
  focus() {
    this.stopped.set(true);
    this.syncPlayback();
  }
  toggle() {
    if (this.reduced() || this.rooms.length < 2) return;
    this.stopped.update((value) => !value);
    this.syncPlayback();
  }
  select(index: number, direction?: 'next' | 'previous') {
    if (!this.rooms.length) return;
    this.stopped.set(true);
    this.manualRequest = true;
    const target = (index + this.rooms.length) % this.rooms.length;
    this.requestedDirection = direction ?? (target < this.active() ? 'previous' : 'next');
    this.requested.set(target);
    this.syncPlayback();
    this.commitTarget();
  }
  step(offset: number) {
    if (this.rooms.length) this.select(this.requested() + offset, offset < 0 ? 'previous' : 'next');
  }
  private commitTarget() {
    const target = this.requested();
    if (this.moving() || !this.loaded().has(target)) return;
    if (target === this.active()) {
      if (this.manualRequest) this.announce();
      return;
    }
    this.direction.set(this.requestedDirection);
    this.previous.set(this.reduced() ? null : this.active());
    this.moving.set(!this.reduced());
    this.active.set(target);
    if (this.manualRequest) this.announce();
    this.syncPlayback();
    if (this.moving()) this.transitionTimer = setTimeout(() => this.finishTransition(), 650);
  }
  private finishTransition() {
    clearTimeout(this.transitionTimer);
    this.transitionTimer = undefined;
    this.moving.set(false);
    this.previous.set(null);
    this.commitTarget();
    this.syncPlayback();
  }
  private announce() {
    this.announcement.set(`Slide ${this.active() + 1} trên ${this.rooms.length}`);
    this.manualRequest = false;
  }
  private syncPlayback() {
    const allowed =
      this.rooms.length > 1 &&
      this.loaded().has(this.active()) &&
      !this.stopped() &&
      !this.reduced() &&
      !this.hovering &&
      !this.formActive &&
      this.inView &&
      !document.hidden &&
      !this.moving() &&
      this.requested() === this.active();
    if (!allowed) {
      clearTimeout(this.timer);
      this.timer = undefined;
      this.running.set(false);
    } else if (!this.timer) {
      this.cycle.update((value) => value + 1);
      this.running.set(true);
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.running.set(false);
        this.requestedDirection = 'next';
        this.requested.set((this.active() + 1) % this.rooms.length);
        this.commitTarget();
      }, 3000);
    }
  }
  scrollToMap() {
    const target = document.getElementById('home-map');
    if (!target) return;
    const height =
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--customer-header-height'),
      ) || 80;
    window.scrollTo({
      top: window.scrollY + target.getBoundingClientRect().top - height - 20,
      behavior: this.reduced() ? 'instant' : 'smooth',
    });
  }
  ngOnDestroy() {
    clearTimeout(this.timer);
    clearTimeout(this.transitionTimer);
    this.observer?.disconnect();
    this.motion?.removeEventListener('change', this.motionChange);
    document.removeEventListener('visibilitychange', this.visibility);
  }
}
