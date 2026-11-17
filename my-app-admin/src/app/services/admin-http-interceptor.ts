import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { retry, throwError, timer } from 'rxjs';

// Apply one hosting policy to every admin API, including bootstrap catalogs and notifications.
export const adminHttpInterceptor: HttpInterceptorFn = (request, next) => {
  const localApi =
    request.url.startsWith('/') &&
    !request.url.startsWith('//') &&
    !/^\/(?:assets|management|staff)(?:\/|$)/.test(request.url);
  if (!localApi) return next(request);
  const outgoing = request.clone({ timeout: Math.max(request.timeout ?? 0, 60000) });
  const response = next(outgoing);
  if (request.method !== 'GET') return response;
  return response.pipe(
    retry({
      count: 1,
      delay: (error: unknown) =>
        error instanceof HttpErrorResponse && [0, 502, 503, 504].includes(error.status)
          ? timer(750)
          : throwError(() => error),
    }),
  );
};
