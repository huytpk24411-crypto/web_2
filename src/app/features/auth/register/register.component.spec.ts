import { TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { AuthModule } from '../auth.module';
import { RegisterComponent } from './register.component';
describe('RegisterComponent', () => {
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
    const fixture = TestBed.createComponent(RegisterComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.children.length).toBeGreaterThan(0);
  });
  it('kiểm tra username, số điện thoại và xác nhận mật khẩu khớp', () => {
    const fixture = TestBed.createComponent(RegisterComponent);
    const component = fixture.componentInstance;
    component.form.setValue({
      username: 'khachthu',
      name: 'Khách thử',
      phone: 'not-a-phone',
      password: 'abc12345',
      confirm: 'xyz',
    });

    expect(component.form.controls.phone.hasError('pattern')).toBe(true);
    expect(component.form.hasError('passwordMismatch')).toBe(true);

    component.form.controls.phone.setValue('0907654321');
    component.form.controls.confirm.setValue('abc12345');
    expect(component.form.valid).toBe(true);

    component.form.controls.username.setValue('ab');
    expect(component.form.controls.username.hasError('pattern')).toBe(true);
  });
});
