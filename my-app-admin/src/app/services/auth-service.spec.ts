import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth-service';

describe('Auth phone draft', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }),
  );

  it('keeps only a valid phone in memory without persisting it', () => {
    const localWrite = vi.spyOn(localStorage, 'setItem');
    const sessionWrite = vi.spyOn(sessionStorage, 'setItem');
    const auth = TestBed.inject(AuthService);
    expect(auth.getAuthPhoneDraft()).toBeUndefined();
    auth.rememberAuthPhone(' +84901234567 ');
    expect(auth.getAuthPhoneDraft()).toBe('+84901234567');
    auth.rememberAuthPhone('0901234567');
    expect(auth.getAuthPhoneDraft()).toBe('0901234567');
    expect(localWrite).not.toHaveBeenCalled();
    expect(sessionWrite).not.toHaveBeenCalled();
    const fresh = TestBed.runInInjectionContext(() => new AuthService());
    expect(fresh.getAuthPhoneDraft()).toBeUndefined();
  });
  it.each(['khachthu', '090', ''])(
    'does not transfer a username or invalid phone (%s)',
    (value) => {
      const auth = TestBed.inject(AuthService);
      auth.rememberAuthPhone('0901234567');
      auth.rememberAuthPhone(value);
      expect(auth.getAuthPhoneDraft()).toBe('');
    },
  );
});
