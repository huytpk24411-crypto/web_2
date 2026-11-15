import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CustomerAPIService } from './customer-apiservice';
import { ContactService } from './contact-service';

describe('Customer API transport', () => {
  let api: CustomerAPIService;
  let http: HttpTestingController;
  const data = {
    name: 'Khách tư vấn',
    phone: '0906666666',
    email: 'khach@example.test',
    message: 'Cần tư vấn phòng gần trường.',
  };
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(CustomerAPIService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('uses credentialed text JSON and preserves HTTP errors on writes without retrying', () => {
    const error = vi.fn();
    api.addFavorite('phong-48').subscribe({ error });
    const request = http.expectOne('/favorites/');
    expect(request.request.method).toBe('POST');
    expect(request.request.responseType).toBe('text');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.body).toEqual({ roomId: 'phong-48' });
    request.flush('{}', { status: 403, statusText: 'Forbidden' });
    expect(error.mock.calls[0][0].status).toBe(403);
    http.expectNone('/favorites/');
  });
  it('retries reads and maps the favorite array', () => {
    const loaded = vi.fn();
    api.favorites().subscribe(loaded);
    http.expectOne('/favorites/').flush('offline', { status: 503, statusText: 'Offline' });
    http.expectOne('/favorites/').flush('[{"roomId":"phong-48"}]');
    expect(loaded).toHaveBeenCalledWith([{ roomId: 'phong-48' }]);
  });
  it('encodes business IDs for cancellation, deletion and notification reads', () => {
    api.cancelViewing('a/b').subscribe();
    const cancel = http.expectOne('/viewings/a%2Fb/cancel');
    expect(cancel.request.method).toBe('PUT');
    cancel.flush('{}');
    api.removeFavorite('a/b').subscribe();
    const remove = http.expectOne('/favorites/a%2Fb');
    expect(remove.request.method).toBe('DELETE');
    remove.flush('{}');
    api.readNotification('a/b').subscribe();
    http.expectOne('/notifications/a%2Fb/read').flush('{}');
    api.readAllNotifications().subscribe();
    http.expectOne('/notifications/read-all').flush('{"updated":2}');
  });
  it.each([0, 400, 401, 403, 409, 502, 503, 504])(
    'contact failure %s rejects without a local success',
    async (status) => {
      const contacts = TestBed.inject(ContactService);
      const pending = contacts.send(data);
      const rejected = expect(pending).rejects.toMatchObject({ status });
      const req = http.expectOne('/contact-requests');
      if (!status) req.error(new ProgressEvent('error'));
      else req.flush('{}', { status, statusText: 'Rejected' });
      await rejected;
      http.expectNone('/contact-requests');
    },
  );
  it('returns only the contact record acknowledged by the API', async () => {
    const pending = TestBed.inject(ContactService).send(data);
    const record = {
      ...data,
      id: 'contact-test',
      status: 'PENDING',
      createdAt: '2026-11-05T01:00:00Z',
    };
    http.expectOne('/contact-requests').flush(JSON.stringify(record));
    expect(await pending).toEqual(record);
  });
});
