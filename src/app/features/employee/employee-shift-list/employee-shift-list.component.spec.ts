import { TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { EmployeeModule } from '../employee.module';
import { EmployeeShiftListComponent } from './employee-shift-list.component';
describe('EmployeeShiftListComponent', () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [EmployeeModule],
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
    const fixture = TestBed.createComponent(EmployeeShiftListComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.children.length).toBeGreaterThan(0);
  });
});
