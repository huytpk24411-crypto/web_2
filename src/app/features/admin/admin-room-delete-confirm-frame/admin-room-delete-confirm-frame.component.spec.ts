import { seedFrameFixture } from '../../../testing/frame-fixture';
import { TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { AdminModule } from '../admin.module';
import { AdminRoomDeleteConfirmFrameComponent } from './admin-room-delete-confirm-frame.component';
import { SEED_ROOMS } from '../../../data/rooms';
describe('AdminRoomDeleteConfirmFrameComponent', () => {
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
            queryParams: of({}),
            params: of({ id: 'r1' }),
          },
        },
      ],
    }).compileComponents();
  });
  it('khởi tạo và render frame bằng HTML', async () => {
    seedFrameFixture('admin', 'admin-room-delete-confirm-frame');
    const fixture = TestBed.createComponent(AdminRoomDeleteConfirmFrameComponent);
    fixture.componentRef.setInput('room', SEED_ROOMS[0]);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.not-found')).toBeNull();
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.children.length).toBeGreaterThan(0);
  });
});
