import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ContractReviewAPIService } from './contract-review-apiservice';

describe('Contract review A8 transport', () => {
  let api: ContractReviewAPIService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ContractReviewAPIService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('retains the idempotency key when retrying an uncertain approval', async () => {
    const first = api.approve('d1');
    const rejected = expect(first).rejects.toBeDefined();
    const request = http.expectOne('/data/admin/deposits/d1/approve-contract');
    const key = request.request.headers.get('Idempotency-Key');
    request.error(new ProgressEvent('error'));
    await rejected;
    const retry = api.approve('d1');
    const next = http.expectOne('/data/admin/deposits/d1/approve-contract');
    expect(next.request.headers.get('Idempotency-Key')).toBe(key);
    expect(next.request.withCredentials).toBe(true);
    next.flush({});
    await retry;
  });

  it('rejects an oversized note without sending a request', async () => {
    await expect(api.abandon('d1', 'x'.repeat(501))).rejects.toThrow('500');
    http.expectNone((r) => r.method === 'POST');
  });
});
