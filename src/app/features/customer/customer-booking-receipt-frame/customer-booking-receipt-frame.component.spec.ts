import { seedFrameFixture } from '../../../testing/frame-fixture';
import { TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { CustomerModule } from '../customer.module';
import { CustomerBookingReceiptFrameComponent } from './customer-booking-receipt-frame.component';
describe('CustomerBookingReceiptFrameComponent', () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [CustomerModule],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: {},
              paramMap: convertToParamMap({ id: 'r1' }),
              queryParamMap: convertToParamMap({ roomId: 'r1' }),
            },
            queryParams: of({}),
            params: of({ id: 'r1' }),
          },
        },
      ],
    }).compileComponents();
  });
  it('khởi tạo và render frame bằng HTML', async () => {
    seedFrameFixture('customer', 'customer-booking-receipt-frame');
    const fixture = TestBed.createComponent(CustomerBookingReceiptFrameComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.not-found')).toBeNull();
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.children.length).toBeGreaterThan(0);
  });
});
