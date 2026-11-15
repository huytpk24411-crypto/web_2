import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { seedFrameFixture } from '../../testing/frame-fixture';
import { CustomerModule } from '../customer-module';
import { CustomerRoomListComponent } from './customer-room-list';
describe('CustomerRoomListComponent', () => {
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
              paramMap: convertToParamMap({ id: 'phong-48' }),
              queryParamMap: convertToParamMap({ roomId: 'phong-48' }),
            },
            queryParams: of({}),
            params: of({ id: 'phong-48' }),
          },
        },
      ],
    }).compileComponents();
  });
  it('khởi tạo và render frame bằng HTML', async () => {
    seedFrameFixture('customer', 'customer-room-list-frame');
    const fixture = TestBed.createComponent(CustomerRoomListComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.not-found')).toBeNull();
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.children.length).toBeGreaterThan(0);
  });
});
