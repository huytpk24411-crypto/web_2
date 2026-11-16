import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth-service';
import { DepositDocumentService } from './deposit-document-service';
import { apiMessage } from './api-message';

describe('DepositDocumentService', () => {
  let service: DepositDocumentService;
  let http: HttpTestingController;
  const account = signal({ id: 'account-test' });
  beforeEach(() => {
    account.set({ id: 'account-test' });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { account, serverAuthenticated: signal(true) } },
      ],
    });
    service = TestBed.inject(DepositDocumentService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('lists only server drafts with session credentials', async () => {
    const list = service.listDrafts();
    const req = http.expectOne('/data/me/deposit-drafts');
    expect(req.request.withCredentials).toBe(true);
    req.flush({ items: [] });
    expect(await list).toEqual({ items: [] });
  });
  it('includes an idempotency key for each draft mutation', async () => {
    const create = service.saveDraft({ phone: '0901234567' });
    const createRequest = http.expectOne('/data/me/deposit-drafts');
    const createKey = createRequest.request.headers.get('Idempotency-Key');
    expect(createRequest.request.method).toBe('POST');
    expect(createKey).toBeTruthy();
    createRequest.flush({ id: 'nhap-test' });
    await create;

    const update = service.saveDraft({ note: 'Cập nhật nháp' }, 'nhap-test');
    const updateRequest = http.expectOne('/data/me/deposit-drafts/nhap-test');
    const updateKey = updateRequest.request.headers.get('Idempotency-Key');
    expect(updateRequest.request.method).toBe('PUT');
    expect(updateKey).toBeTruthy();
    expect(updateKey).not.toBe(createKey);
    updateRequest.flush({ id: 'nhap-test' });
    await update;

    const remove = service.deleteDraft('nhap-test');
    const deleteRequest = http.expectOne('/data/me/deposit-drafts/nhap-test');
    const deleteKey = deleteRequest.request.headers.get('Idempotency-Key');
    expect(deleteRequest.request.method).toBe('DELETE');
    expect(deleteKey).toBeTruthy();
    expect(deleteKey).not.toBe(updateKey);
    deleteRequest.flush({ ok: true });
    await remove;
  });
  it('does not return documents after the logged-in account changes', async () => {
    const list = service.listDrafts();
    const result = expect(list).rejects.toThrow('Phiên đăng nhập đã thay đổi');
    account.set({ id: 'another-account' });
    http.expectOne('/data/me/deposit-drafts').flush({ items: [] });
    await result;
  });
  it.each([
    ['INVALID_DRAFT', 400, 'Nháp không hợp lệ.'],
    ['DRAFT_LIMIT', 409, 'Bạn đã có 20 nháp. Hãy xóa bớt nháp cũ.'],
    ['NOT_FOUND', 404, 'Không tìm thấy nháp. Vui lòng tải lại.'],
  ])('maps draft error %s', async (code, status, message) => {
    const remove = service.deleteDraft('nhap-test');
    const result = expect(remove).rejects.toThrow(String(message));
    http
      .expectOne('/data/me/deposit-drafts/nhap-test')
      .flush({ code }, { status: Number(status), statusText: 'Rejected' });
    await result;
  });
  it('keeps NOT_FOUND wording specific to drafts', () => {
    const error = new HttpErrorResponse({ status: 404, error: { code: 'NOT_FOUND' } });
    expect(apiMessage(error, '', 'deposit-draft')).toBe('Không tìm thấy nháp. Vui lòng tải lại.');
    expect(apiMessage(error, '')).toBe('Không tìm thấy bản ghi. Vui lòng tải lại danh sách.');
  });
});
