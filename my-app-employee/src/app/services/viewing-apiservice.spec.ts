import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { ViewingAPIService } from './viewing-apiservice';

describe('ViewingAPIService', () => {
  let api: ViewingAPIService, http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ViewingAPIService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it.each(['DA_XAC_NHAN', 'DA_XEM'] as const)(
    'sends the %s status payload with employee credentials',
    async (status) => {
      const pending = firstValueFrom(api.updateStatus('viewing/1', status));
      const req = http.expectOne('/viewings/viewing%2F1/status');
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ status });
      expect(req.request.withCredentials).toBe(true);
      expect(req.request.headers.get('X-iHouzz-Portal')).toBe('employee');
      expect(req.request.headers.get('Content-Type')).toBe('application/json');
      expect(req.request.responseType).toBe('text');
      req.flush(JSON.stringify({ id: 'viewing/1', status }));
      expect(await pending).toEqual({ id: 'viewing/1', status });
    },
  );

  it('sends the detail result and note together', async () => {
    const pending = firstValueFrom(api.updateDetail('detail/1', 'DA_XEM', 'Khách đã xem phòng.'));
    const req = http.expectOne('/viewing-details/detail%2F1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ viewStatus: 'DA_XEM', note: 'Khách đã xem phòng.' });
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.headers.get('X-iHouzz-Portal')).toBe('employee');
    expect(req.request.responseType).toBe('text');
    req.flush('{}');
    await pending;
  });

  it('turns a text CHECK_IN_REQUIRED error into Vietnamese', async () => {
    const pending = firstValueFrom(api.updateDetail('d', 'CHUA_XEM', ''));
    const rejected = expect(pending).rejects.toThrow(
      'Cần check-in ca trước khi ghi kết quả dẫn xem.',
    );
    http.expectOne('/viewing-details/d').flush(JSON.stringify({ code: 'CHECK_IN_REQUIRED' }), {
      status: 409,
      statusText: 'Conflict',
    });
    await rejected;
  });

  it('does not expose unknown error codes', () => {
    expect(api.message(new HttpErrorResponse({ status: 400, error: '{"code":"UNKNOWN"}' }))).toBe(
      'Không thực hiện được thao tác. Vui lòng tải lại và thử lại.',
    );
  });
});
