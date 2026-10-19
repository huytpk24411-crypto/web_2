import { seedFrameFixture } from '../../../testing/frame-fixture';
import { TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { AdminModule } from '../admin.module';
import { AdminStaffListFrameComponent } from './admin-staff-list-frame.component';
describe('AdminStaffListFrameComponent', () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminModule],
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
            data: of({ staffView: 'list' }),
            paramMap: of(convertToParamMap({ id: 'r1' })),
            queryParams: of({}),
            params: of({ id: 'r1' }),
          },
        },
      ],
    }).compileComponents();
  });
  it('khởi tạo và render frame bằng HTML', async () => {
    seedFrameFixture('admin', 'admin-staff-list-frame');
    const fixture = TestBed.createComponent(AdminStaffListFrameComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.not-found')).toBeNull();
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.children.length).toBeGreaterThan(0);
  });
});
