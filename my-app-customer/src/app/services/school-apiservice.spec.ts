import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { API_SCHOOLS as SCHOOLS } from '../testing/api-fixtures';
import { SchoolAPIService } from './school-apiservice';

describe('SchoolAPIService', () => {
  let api: SchoolAPIService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(SchoolAPIService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('parses GET /data/schools from text with the practice headers', () => {
    const result = vi.fn();
    api.getSchools().subscribe(result);
    const req = http.expectOne('/data/schools');
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('text');
    expect(req.request.headers.get('Content-Type')).toBe('text/plain;charset=utf-8');
    req.flush(JSON.stringify(SCHOOLS));
    expect(result).toHaveBeenCalledExactlyOnceWith(SCHOOLS);
  });

  it('recovers after one network retry', () => {
    const result = vi.fn();
    api.getSchools().subscribe(result);
    http.expectOne('/data/schools').error(new ProgressEvent('error'));
    http.expectOne('/data/schools').flush('[]');
    expect(result).toHaveBeenCalledExactlyOnceWith([]);
  });

  it('stops after the second error and preserves its HTTP status', () => {
    const error = vi.fn();
    api.getSchools().subscribe({ error });
    for (let attempt = 0; attempt < 2; attempt++) {
      http.expectOne('/data/schools').flush('offline', {
        status: 503,
        statusText: 'Unavailable',
      });
    }
    expect(error).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: 503 }));
    http.expectNone('/data/schools');
  });
});
