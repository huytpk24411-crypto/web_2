import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ShiftAPIService } from '../../services/shift-apiservice';
import { AdminModule } from '../admin-module';
import { AdminShiftMonitorComponent } from './admin-shift-monitor';

describe('Admin shift monitor display', () => {
  it('warns for absent assignments and renders sorted penalty levels on separate lines', async () => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    const levels = [
      { id: 'b', policyId: 'p', from: 31, to: null, amount: 100000 },
      { id: 'a', policyId: 'p', from: 1, to: 16, amount: 20000 },
    ];
    await TestBed.configureTestingModule({
      imports: [AdminModule],
      providers: [
        provideRouter([]),
        {
          provide: ShiftAPIService,
          useValue: {
            loading: signal(false),
            error: signal(''),
            online: () => true,
            refresh: async () => {},
            state: () => ({
              admin: {
                Shift: [
                  {
                    id: 's',
                    date: today,
                    startsAt: today + 'T07:00:00+07:00',
                    label: 'Ca sáng',
                    startTime: '07:00',
                    endTime: '11:00',
                  },
                ],
                ShiftAssignment: [{ id: 'a', shiftId: 's', employeeId: 'e', status: 'ABSENT' }],
                Attendance: [],
                WorkLocation: [],
                Employee: [{ id: 'e', fullName: 'Nhân viên' }],
                Policy: [
                  {
                    id: 'p',
                    type: 'PHAT_TRE',
                    version: 1,
                    status: 'ACTIVE',
                    effectiveFrom: '2020-01-01',
                    effectiveTo: null,
                  },
                ],
                PolicyLevel: levels,
              },
            }),
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(AdminShiftMonitorComponent);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('.shift-card.late .shift-status').textContent,
    ).toContain('Vắng mặt');
    expect(fixture.nativeElement.querySelector('.late-policy strong').textContent).toContain(
      'Phạt đi trễ (v1)',
    );
    const lines = [...fixture.nativeElement.querySelectorAll('.late-policy p')].map(
      (p: HTMLElement) => p.textContent.trim(),
    );
    expect(lines).toEqual(['Từ 1 đến dưới 16 phút: 20.000 đ', 'Từ 31 phút trở lên: 100.000 đ']);
    expect(levels[0].from).toBe(31);
    fixture.destroy();
  });
});
