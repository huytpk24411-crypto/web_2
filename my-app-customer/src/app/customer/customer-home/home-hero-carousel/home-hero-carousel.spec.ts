import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, RouterModule } from '@angular/router';
import { API_ROOMS } from '../../../testing/api-fixtures';
import { CustomerModule } from '../../customer-module';
import { HomeHeroCarouselComponent } from './home-hero-carousel';

describe('Home hero carousel', () => {
  let fixture: ComponentFixture<HomeHeroCarouselComponent>;
  let component: HomeHeroCarouselComponent;
  let motion: {
    matches: boolean;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };
  let intersect: IntersectionObserverCallback;
  let disconnect: ReturnType<typeof vi.fn>;
  const slides = API_ROOMS.filter((room) => room.featured && room.status === 'AVAILABLE');
  function create(reduced = false) {
    motion.matches = reduced;
    fixture = TestBed.createComponent(HomeHeroCarouselComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('rooms', slides);
    fixture.detectChanges();
  }
  function loadAll() {
    slides.forEach((_, i) => component.imageLoaded(i));
    fixture.detectChanges();
  }
  beforeEach(async () => {
    TestBed.resetTestingModule();
    motion = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => motion),
    );
    disconnect = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          intersect = callback;
        }
        observe = vi.fn();
        disconnect = disconnect;
      },
    );
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    await TestBed.configureTestingModule({
      imports: [CustomerModule, RouterModule],
      providers: [provideRouter([])],
    }).compileComponents();
    vi.useFakeTimers();
  });
  afterEach(() => {
    try {
      TestBed.resetTestingModule();
    } finally {
      if (vi.isFakeTimers()) vi.clearAllTimers();
      vi.useRealTimers();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });

  it('waits for images and advances after three seconds without live announcements', () => {
    create();
    vi.advanceTimersByTime(8000);
    expect(component.active()).toBe(0);
    loadAll();
    vi.advanceTimersByTime(2999);
    expect(component.active()).toBe(0);
    vi.advanceTimersByTime(1);
    expect(component.active()).toBe(1);
    expect(component.announcement()).toBe('');
  });
  it('holds the current image until the requested image has loaded', () => {
    create();
    component.imageLoaded(0);
    vi.advanceTimersByTime(3000);
    expect(component.active()).toBe(0);
    expect(component.running()).toBe(false);
    component.imageLoaded(1);
    expect(component.active()).toBe(1);
  });
  it('pauses on hover and resumes after leaving', () => {
    create();
    loadAll();
    fixture.nativeElement.querySelector('section').dispatchEvent(new MouseEvent('mouseenter'));
    vi.advanceTimersByTime(8000);
    expect(component.active()).toBe(0);
    fixture.nativeElement.querySelector('section').dispatchEvent(new MouseEvent('mouseleave'));
    vi.advanceTimersByTime(3000);
    expect(component.active()).toBe(1);
  });
  it('keeps keyboard focus and manual navigation stopped until Play is pressed', () => {
    create();
    loadAll();
    const play = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    play.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    vi.advanceTimersByTime(8000);
    expect(component.active()).toBe(0);
    play.click();
    vi.advanceTimersByTime(3000);
    expect(component.active()).toBe(1);
    vi.advanceTimersByTime(650);
    component.select(2);
    vi.advanceTimersByTime(15000);
    expect(component.active()).toBe(2);
    expect(component.announcement()).toBe('Slide 3 trên 3');
    expect(component.stopped()).toBe(true);
  });
  it('coalesces rapid manual navigation to the last target', () => {
    create();
    loadAll();
    component.select(1);
    component.select(2);
    component.select(0);
    expect(component.active()).toBe(1);
    expect(component.direction()).toBe('next');
    vi.advanceTimersByTime(650);
    expect(component.active()).toBe(0);
    expect(component.direction()).toBe('previous');
    expect(component.announcement()).toBe('Slide 1 trên 3');
  });
  it('disables autoplay and zoom in reduced motion while allowing direct navigation', () => {
    create(true);
    loadAll();
    vi.advanceTimersByTime(30000);
    expect(component.active()).toBe(0);
    expect(component.running()).toBe(false);
    expect(component.zoom()).toBe(false);
    component.select(2);
    expect(component.active()).toBe(2);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.zoom')).toBeNull();
    expect(component.moving()).toBe(false);
    expect(component.previous()).toBeNull();
    expect(fixture.nativeElement.querySelector('.entering, .leaving')).toBeNull();
  });
  it('uses accessible dot buttons and slides in the direction of the selected dot', () => {
    create();
    loadAll();
    const dots = fixture.nativeElement.querySelectorAll(
      '.slide-selectors button',
    ) as NodeListOf<HTMLButtonElement>;
    expect(dots).toHaveLength(slides.length);
    dots.forEach((dot, i) => {
      expect(dot.textContent!.trim()).toBe('');
      expect(dot.querySelector('.slide-dot')).not.toBeNull();
      expect(dot.getAttribute('aria-label')).toBe(`Slide ${i + 1}: ${slides[i].name}`);
    });
    expect(dots[0].getAttribute('aria-current')).toBe('true');
    dots[2].click();
    fixture.detectChanges();
    expect(component.active()).toBe(2);
    expect(component.direction()).toBe('next');
    expect(fixture.nativeElement.querySelector('.hero-slide.active.entering')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.hero-slide.leaving').hasAttribute('inert')).toBe(
      true,
    );
    expect(dots[2].getAttribute('aria-current')).toBe('true');
    vi.advanceTimersByTime(650);
    dots[0].click();
    fixture.detectChanges();
    expect(component.direction()).toBe('previous');
    expect(fixture.nativeElement.querySelector('.slides.reverse')).not.toBeNull();
    expect(component.announcement()).toBe('Slide 1 trên 3');
    vi.advanceTimersByTime(650);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.entering, .leaving')).toBeNull();
  });
  it('places arrow controls outside the dot row and preserves their direction across wraparound', () => {
    create();
    loadAll();
    expect(fixture.nativeElement.querySelectorAll('.edge-navigation button')).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('.carousel-controls .edge-arrow')).toBeNull();
    fixture.nativeElement.querySelector('[aria-label="Slide trước"]').click();
    expect(component.active()).toBe(slides.length - 1);
    expect(component.direction()).toBe('previous');
    vi.advanceTimersByTime(650);
    fixture.nativeElement.querySelector('[aria-label="Slide sau"]').click();
    expect(component.active()).toBe(0);
    expect(component.direction()).toBe('next');
  });
  it('wraps autoplay forward after a full three-second dwell following the transition', () => {
    create();
    loadAll();
    component.select(slides.length - 1);
    component.toggle();
    vi.advanceTimersByTime(649);
    expect(component.running()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(component.running()).toBe(true);
    vi.advanceTimersByTime(2999);
    expect(component.active()).toBe(slides.length - 1);
    vi.advanceTimersByTime(1);
    expect(component.active()).toBe(0);
    expect(component.direction()).toBe('next');
  });
  it('keeps the previous direction when a requested image needs to finish loading', () => {
    create();
    component.imageLoaded(0);
    component.step(-1);
    vi.advanceTimersByTime(5000);
    expect(component.active()).toBe(0);
    expect(component.moving()).toBe(false);
    component.imageLoaded(slides.length - 1);
    expect(component.active()).toBe(slides.length - 1);
    expect(component.direction()).toBe('previous');
    expect(component.previous()).toBe(0);
  });
  it('finishes a running slide immediately when reduced motion is enabled', () => {
    create();
    loadAll();
    component.select(1);
    component.select(2);
    expect(component.moving()).toBe(true);
    motion.matches = true;
    const listener = motion.addEventListener.mock.calls[0][1] as () => void;
    listener();
    fixture.detectChanges();
    expect(component.active()).toBe(2);
    expect(component.moving()).toBe(false);
    expect(component.running()).toBe(false);
    expect(fixture.nativeElement.querySelector('.entering, .leaving')).toBeNull();
  });
  it('pauses for form interactions, hidden tabs and an offscreen hero', () => {
    create();
    loadAll();
    fixture.componentRef.setInput('formActive', true);
    fixture.detectChanges();
    vi.advanceTimersByTime(8000);
    expect(component.active()).toBe(0);
    fixture.componentRef.setInput('formActive', false);
    fixture.detectChanges();
    intersect([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
    vi.advanceTimersByTime(8000);
    expect(component.active()).toBe(0);
    intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(8000);
    expect(component.active()).toBe(0);
  });
  it('stops an existing timer and zoom when reduced motion is enabled at runtime', () => {
    create();
    loadAll();
    motion.matches = true;
    const listener = motion.addEventListener.mock.calls[0][1] as () => void;
    listener();
    component.toggle();
    vi.advanceTimersByTime(15000);
    expect(component.active()).toBe(0);
    expect(component.running()).toBe(false);
    expect(component.zoom()).toBe(false);
  });
  it('links each slide to its room, hides inactive focus targets and prioritizes only the first image', () => {
    create();
    expect(fixture.nativeElement.querySelectorAll('img')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('img').getAttribute('fetchpriority')).toBe('high');
    loadAll();
    const links = fixture.nativeElement.querySelectorAll(
      '.slide-link',
    ) as NodeListOf<HTMLAnchorElement>;
    slides.forEach((room, i) => expect(links[i].getAttribute('href')).toBe('/rooms/' + room.id));
    expect(fixture.nativeElement.querySelectorAll('.hero-slide[inert]')).toHaveLength(2);
    expect(fixture.nativeElement.querySelectorAll('.slide-caption[inert]')).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('button').classList.contains('play-control')).toBe(
      true,
    );
  });
  it('keeps two headline lines and both room and map actions in the content flow', () => {
    create();
    loadAll();
    const content = fixture.nativeElement.querySelector('.hero-content') as HTMLElement;
    const lines = content.querySelectorAll('.hero-title-line');
    expect(Array.from(lines, (line) => line.textContent)).toEqual([
      'Gần trường hơn.',
      'Gần cuộc sống bạn muốn.',
    ]);
    expect(content.querySelectorAll(':scope > .slide-info-stack')).toHaveLength(1);
    const actions = content.querySelector('.hero-actions')!;
    expect(actions.querySelector('.room-cta')!.getAttribute('href')).toBe('/rooms/' + slides[0].id);
    const map = vi.spyOn(component, 'scrollToMap').mockImplementation(() => {});
    actions.querySelector<HTMLButtonElement>('.map-cta')!.click();
    expect(map).toHaveBeenCalledOnce();
    component.select(1);
    fixture.detectChanges();
    expect(actions.querySelector('.room-cta')!.getAttribute('href')).toBe('/rooms/' + slides[1].id);
    expect(content.querySelectorAll('.slide-caption.active')).toHaveLength(1);
    expect(content.querySelector('.carousel-controls')).not.toBeNull();
  });
  it('retains a stable heading with no slides and cleans up observers and timers', () => {
    create();
    loadAll();
    fixture.componentRef.setInput('rooms', []);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('h1').textContent).toContain('Gần trường hơn.');
    expect(fixture.nativeElement.querySelector('.carousel-controls')).toBeNull();
    fixture.destroy();
    expect(disconnect).toHaveBeenCalled();
    expect(motion.removeEventListener).toHaveBeenCalled();
    vi.advanceTimersByTime(15000);
    expect(component.active()).toBe(0);
  });
});
