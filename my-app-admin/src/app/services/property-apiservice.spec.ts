import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';
import {
  API_PROPERTIES as PROPERTIES,
  API_RELATIONS as PROPERTY_SCHOOLS,
} from '../testing/api-fixtures';
import { PropertyAPIService } from './property-apiservice';
import { adminHttpInterceptor } from './admin-http-interceptor';

describe('PropertyAPIService', () => {
  let api: PropertyAPIService;
  let http: HttpTestingController;
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([adminHttpInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    api = TestBed.inject(PropertyAPIService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  for (const endpoint of ['properties', 'property-schools'] as const) {
    it(`parses GET /data/${endpoint} as text and preserves model IDs`, () => {
      const result = vi.fn();
      const payload = endpoint === 'properties' ? PROPERTIES : PROPERTY_SCHOOLS;
      const request: Observable<unknown[]> =
        endpoint === 'properties' ? api.getProperties() : api.getPropertySchools();
      request.subscribe(result);
      const req = http.expectOne('/data/' + endpoint);
      expect(req.request.method).toBe('GET');
      expect(req.request.responseType).toBe('text');
      expect(req.request.headers.get('Content-Type')).toBe('text/plain;charset=utf-8');
      req.flush(JSON.stringify(payload));
      expect(result).toHaveBeenCalledWith(payload);
    });

    it(`retries /data/${endpoint} only once and preserves HTTP status`, async () => {
      const error = vi.fn();
      const request: Observable<unknown[]> =
        endpoint === 'properties' ? api.getProperties() : api.getPropertySchools();
      request.subscribe({ error });
      for (let attempt = 0; attempt < 2; attempt++) {
        http.expectOne('/data/' + endpoint).flush('offline', {
          status: 503,
          statusText: 'Unavailable',
        });
        if (attempt === 0) await vi.advanceTimersByTimeAsync(750);
      }
      expect(error).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: 503 }));
      http.expectNone('/data/' + endpoint);
    });
  }
});
