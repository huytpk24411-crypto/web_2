import { HttpErrorResponse } from '@angular/common/http';
import { isApiUnavailable } from './api-fallback';

describe('API offline classification', () => {
  it.each([0, 500, 502, 503, 504, 599])(
    'treats HTTP %s as offline regardless of the error prototype',
    (status) => {
      expect(isApiUnavailable(new HttpErrorResponse({ status }))).toBe(true);
      expect(isApiUnavailable({ name: 'HttpErrorResponse', status, error: 'Bad gateway' })).toBe(
        true,
      );
    },
  );
  it.each([400, 401, 403, 404, 409, 422])(
    'preserves HTTP %s as a rejection even with non-JSON errors',
    (status) => {
      expect(
        isApiUnavailable(
          new HttpErrorResponse({ status, error: new SyntaxError('HTML response') }),
        ),
      ).toBe(false);
      expect(isApiUnavailable({ status, error: { name: 'SyntaxError' } })).toBe(false);
    },
  );
  it('recognizes raw and wrapped JSON parse errors without masking application errors', () => {
    expect(isApiUnavailable(new SyntaxError('HTML response'))).toBe(true);
    expect(isApiUnavailable({ name: 'SyntaxError' })).toBe(true);
    expect(
      isApiUnavailable(
        new HttpErrorResponse({ status: 200, error: new SyntaxError('HTML response') }),
      ),
    ).toBe(true);
    expect(
      isApiUnavailable({ status: 200, error: { error: { name: 'SyntaxError' }, text: '<html>' } }),
    ).toBe(true);
    expect(isApiUnavailable(new Error('Invalid account'))).toBe(false);
    expect(isApiUnavailable(new TypeError('Invalid account'))).toBe(false);
    expect(isApiUnavailable(null)).toBe(false);
  });
});
