import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthService } from './auth-service';
import { MoneyService } from './money-service';
import { DepositService } from './deposit-service';
import { DealService } from './deal-service';
import { MoneyDeposit, MoneyHold } from '../classes/Money';
import { apiMessage } from './api-message';

// HTTP fixtures are independent of the application's initial database contents.
const deposit: MoneyDeposit = {
  id: 'deposit-a',
  number: 'PC-A',
  roomId: 'room-a',
  customerId: 'customer-a',
  employeeId: 'employee-a',
  totalRequired: 1800000,
  holdCredit: 1000000,
  amountDue: 800000,
  paymentIds: [],
  status: 'PAID',
  collected: {
    method: 'CASH',
    amount: 800000,
    note: 'Đã thu',
    at: '2026-11-16T00:00:00Z',
    by: 'employee-a',
  },
  holdId: 'hold-a',
};
const hold: MoneyHold = {
  id: 'hold-a',
  roomId: 'room-a',
  customerId: 'customer-a',
  contact: { name: 'Khách A', phone: '0901234567' },
  amount: 1000000,
  status: 'ACTIVE',
  isActive: true,
  createdAt: '2026-11-05T00:00:00Z',
};

describe('Employee money workflows through HTTP', () => {
  let money: MoneyService,
    deposits: DepositService,
    deals: DealService,
    http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: {
            account: signal({ id: 'account-a', role: 'EMPLOYEE' }),
            serverAuthenticated: signal(true),
          },
        },
      ],
    });
    money = TestBed.inject(MoneyService);
    deposits = TestBed.inject(DepositService);
    deals = TestBed.inject(DealService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  async function request(method: string, url: string): Promise<TestRequest> {
    let req!: TestRequest;
    await vi.waitFor(() => {
      req = http.expectOne({ method, url });
    });
    return req;
  }
  async function reads(
    values: {
      deposits?: MoneyDeposit[];
      holds?: MoneyHold[];
      payments?: unknown[];
      contracts?: unknown[];
      transactions?: unknown[];
    } = {},
  ) {
    (await request('GET', '/data/holds/creditable')).flush(JSON.stringify(values.holds || []));
    http.expectOne('/data/payments').flush(JSON.stringify({ items: values.payments || [] }));
    http.expectOne('/data/deposits').flush(JSON.stringify({ items: values.deposits || [] }));
    http.expectOne('/data/contracts').flush(JSON.stringify({ items: values.contracts || [] }));
    http.expectOne('/data/brokerage-transactions').flush(JSON.stringify(values.transactions || []));
  }
  it('uses server hold credit once, and leaves credit unchanged when the server rejects reuse', async () => {
    const loaded = money.refresh();
    await reads({ holds: [hold] });
    await loaded;
    const input = {
      roomId: 'room-a',
      customerName: 'Khách A',
      phone: '0901234567',
      total: 1800000,
      collectedMethod: 'CASH' as const,
      note: 'Đã thu',
      duration: 12,
      startDate: '2026-12-01',
    };
    const pending = deposits.createRequest(input, hold.id);
    const req = await request('POST', '/data/deposits');
    expect(req.request.body.holdId).toBe(hold.id);
    expect(req.request.body.customerId).toBe(hold.customerId);
    expect(req.request.body.employeeId).toBeUndefined();
    expect(req.request.body.collectedMethod).toBe('CASH');
    expect(req.request.body.note).toBe('Đã thu');
    expect(req.request.body.method).toBeUndefined();
    req.flush(JSON.stringify(deposit));
    await reads({ holds: [hold], deposits: [deposit] });
    const created = await pending;
    expect(created.holdCredit).toBe(1000000);
    expect(created.due).toBe(800000);
    expect(created.method).toBe('CASH');
    expect(created.note).toBe('Đã thu');
    expect(created.apiStatus).toBe('PAID');
    const duplicate = deposits.createRequest(input, hold.id),
      rejected = expect(duplicate).rejects.toThrow('Giữ chỗ đã hết hạn');
    (await request('POST', '/data/deposits')).flush('{"code":"HOLD_NOT_CREDITABLE"}', {
      status: 409,
      statusText: 'Conflict',
    });
    await rejected;
    expect(deposits.list()).toHaveLength(1);
    expect(deposits.get(deposit.id)?.due).toBe(800000);
  });
  it('creates a draft and signs it while awaiting admin confirmation', async () => {
    const draft = {
      id: 'contract-a',
      depositId: deposit.id,
      roomId: 'room-a',
      customerId: 'customer-a',
      number: 'HD-A',
      status: 'DRAFT',
    };
    const created = deals.createContract(deposit.id, '2026-12-01', '2027-12-01', 8400000);
    const create = await request('POST', '/data/contracts');
    expect(create.request.body).toEqual({
      depositId: deposit.id,
      startDate: '2026-12-01',
      endDate: '2027-12-01',
      monthlyRent: 8400000,
    });
    expect(create.request.body.employeeId).toBeUndefined();
    create.flush(JSON.stringify(draft));
    await reads({ deposits: [{ ...deposit, status: 'PAID' }], contracts: [draft] });
    await created;
    const signed = deals.sign(draft.id);
    (await request('POST', '/data/contracts/contract-a/sign')).flush('{}');
    await reads({ contracts: [{ ...draft, status: 'SIGNED' }] });
    await signed;
    expect(deals.get(draft.id)?.apiStatus).toBe('SIGNED');
    expect(deals.get(draft.id)?.statusLabel).toBe('Đã ký – chờ admin xác nhận');
    http.expectNone((r) => r.method === 'POST');
  });
  it('retries an uncertain A6 request with the same idempotency key', async () => {
    const input = {
      roomId: 'room-a',
      customerName: 'Khách A',
      phone: '0901234567',
      total: 1800000,
      collectedMethod: 'BANK_TRANSFER' as const,
      note: 'Đã thu chuyển khoản',
      duration: 12,
      startDate: '2026-12-01',
    };
    const first = deposits.createRequest(input);
    const failed = expect(first).rejects.toThrow('Không kết nối được máy chủ');
    const original = await request('POST', '/data/deposits');
    const key = original.request.headers.get('Idempotency-Key');
    expect(key).toBeTruthy();
    original.error(new ProgressEvent('error'));
    await failed;
    const retry = deposits.createRequest(input);
    const next = await request('POST', '/data/deposits');
    expect(next.request.headers.get('Idempotency-Key')).toBe(key);
    next.flush(JSON.stringify(deposit));
    await reads({ deposits: [deposit] });
    await retry;
    expect(deposits.list()).toHaveLength(1);
    http.expectNone((r) => r.method === 'POST');
  });
  it('shows PAYROLL_CLOSED and does not invent a paid deposit after A6 fails', async () => {
    const pending = deposits.createRequest({
      roomId: 'room-a',
      customerName: 'Khách A',
      phone: '0901234567',
      total: 1800000,
      collectedMethod: 'CASH',
    });
    const rejected = expect(pending).rejects.toThrow(
      'Kỳ lương tháng này đã đóng, không ghi được doanh thu.',
    );
    (await request('POST', '/data/deposits')).flush('{"code":"PAYROLL_CLOSED"}', {
      status: 409,
      statusText: 'Conflict',
    });
    await rejected;
    expect(deposits.list()).toEqual([]);
    expect(money.transactions()).toEqual([]);
  });
  it.each([
    ['PAYMENT_GATEWAY_NOT_CONFIGURED', 503, 'Chưa cấu hình cổng thanh toán.'],
    ['PAYMENT_GATEWAY_REQUIRED', 410, 'Vui lòng thanh toán qua cổng ngân hàng.'],
    ['INVALID_SIGNATURE', 400, 'Chữ ký thanh toán không hợp lệ.'],
    ['FLOW_CHANGED', 410, 'Quy trình cọc đã thay đổi.'],
    ['CONTRACT_NOT_SIGNED', 409, 'Hợp đồng chưa ký.'],
    ['ALREADY_DECIDED', 409, 'Hợp đồng này đã được xác nhận.'],
    ['PAYROLL_CLOSED', 409, 'Kỳ lương tháng này đã đóng, không ghi được doanh thu.'],
  ])('translates DEP-API error %s', (code, status, message) => {
    expect(
      apiMessage(new HttpErrorResponse({ status: Number(status), error: { code } }), 'Lỗi'),
    ).toBe(message);
  });
  it('uploads real identity files and submits all identity fields with credentials', async () => {
    const file = new File(['photo'], 'front.jpg', { type: 'image/jpeg' });
    const upload = money.uploadIdentity(file),
      req = await request('POST', '/api/upload/cccd');
    expect((req.request.body as FormData).get('file')).toBe(file);
    req.flush({ url: '/uploads/cccd/front.jpg' });
    await upload;
    const body = {
      idNumber: '012345678901',
      issuedOn: '2020-01-01',
      issuedBy: 'Cơ quan cấp',
      permanentAddress: 'Địa chỉ thường trú',
      frontImageUrl: '/uploads/cccd/front.jpg',
      backImageUrl: '/uploads/cccd/back.jpg',
    };
    const save = money.saveIdentity('customer-a', body);
    const identity = await request('PUT', '/data/customers/customer-a/identity');
    expect(identity.request.withCredentials).toBe(true);
    expect(identity.request.body).toEqual(body);
    identity.flush(JSON.stringify({ id: 'customer-a', phone: '0901234567' }));
    await save;
  });
  it.each(['CUSTOMER_IDENTITY_REQUIRED', 'DUPLICATE_IDENTITY'])(
    'keeps identity errors visible: %s',
    async (code) => {
      const pending = money.saveIdentity('customer-a', {} as never),
        rejected = expect(pending).rejects.toThrow('CCCD');
      (await request('PUT', '/data/customers/customer-a/identity')).flush(
        JSON.stringify({ code }),
        { status: 400, statusText: 'Invalid' },
      );
      await rejected;
    },
  );
  it('starts a session-bound deposit identity context using an explicit POST', async () => {
    const pending = money.customerForDeposit('0901234567', 'room-a');
    const req = await request('POST', '/data/customers/identity-context');
    expect(req.request.body).toEqual({ customerPhone: '0901234567', roomId: 'room-a' });
    expect(req.request.withCredentials).toBe(true);
    req.flush(JSON.stringify({ id: 'customer-a', phone: '0901234567' }));
    expect((await pending).id).toBe('customer-a');
  });
});
