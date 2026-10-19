import { TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { AuthModule } from '../auth.module';
import { LoginComponent } from './login.component';
describe('LoginComponent', () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AuthModule],
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
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.children.length).toBeGreaterThan(0);
  });
  it('chỉ chấp nhận username làm định danh đăng nhập', () => {
    const fixture = TestBed.createComponent(LoginComponent);
    const { username } = fixture.componentInstance.form.controls;

    username.setValue('customer123');
    expect(username.valid).toBe(true);

    username.setValue('0901234567');
    expect(username.hasError('pattern')).toBe(true);

    username.setValue('90');
    expect(username.hasError('pattern')).toBe(true);

    username.setValue('customer123');
    expect(username.valid).toBe(true);
  });
});
