import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { BackNavigationService } from './back-navigation-service';

describe('BackNavigationService', () => {
  let events: Subject<unknown>;
  let service: BackNavigationService;
  let back: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.fn>;
  let replace: boolean;
  beforeEach(() => {
    events = new Subject();
    back = vi.fn();
    navigate = vi.fn();
    replace = false;
    TestBed.configureTestingModule({
      providers: [
        { provide: Location, useValue: { back } },
        {
          provide: Router,
          useValue: {
            events,
            navigateByUrl: navigate,
            getCurrentNavigation: () => ({ extras: { replaceUrl: replace } }),
          },
        },
      ],
    });
    service = TestBed.inject(BackNavigationService);
  });
  function visit(id: number, url: string, restored?: number) {
    events.next(
      new NavigationStart(
        id,
        url,
        restored ? 'popstate' : 'imperative',
        restored ? { navigationId: restored } : null,
      ),
    );
    events.next(new NavigationEnd(id, url, url));
  }
  it('uses a safe parent fallback for a directly opened page', () => {
    visit(1, '/rooms/room-a');
    service.back('/rooms');
    expect(back).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/rooms', { replaceUrl: true });
  });
  it('returns through actual in-app history, retaining filters and scroll restoration', () => {
    visit(1, '/rooms?price=5000000');
    visit(2, '/rooms/room-a');
    service.back('/rooms');
    expect(back).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });
  it('avoids returning to login after authentication', () => {
    visit(1, '/login?returnUrl=%2Fbookings');
    visit(2, '/bookings');
    service.back('/');
    expect(back).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/', { replaceUrl: true });
  });
  it('tracks browser back and forward without creating return loops', () => {
    visit(1, '/');
    visit(2, '/rooms');
    visit(3, '/rooms/room-a');
    visit(4, '/rooms', 2);
    visit(5, '/', 1);
    service.back('/');
    expect(back).not.toHaveBeenCalled();
    visit(6, '/rooms', 4);
    visit(7, '/rooms/room-a', 3);
    service.back('/rooms');
    expect(back).toHaveBeenCalledOnce();
  });
  it('does not treat a replaced history entry as an extra previous page', () => {
    visit(1, '/rooms/old');
    replace = true;
    visit(2, '/rooms/new');
    service.back('/rooms');
    expect(back).not.toHaveBeenCalled();
  });
});
