import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, RouterModule } from '@angular/router';
import { API_ROOMS, API_SCHOOLS } from '../../../testing/api-fixtures';
import { seedFrameFixture } from '../../../testing/frame-fixture';
import { CustomerModule } from '../../customer-module';
import { HomeSearchComponent } from './home-search';

describe('Home search immediate filters and location combobox', () => {
  let fixture: ComponentFixture<HomeSearchComponent>;
  let component: HomeSearchComponent;
  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [CustomerModule, RouterModule],
      providers: [provideRouter([])],
    }).compileComponents();
    seedFrameFixture('customer', 'home-search');
    fixture = TestBed.createComponent(HomeSearchComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    vi.spyOn(component.search, 'set');
  });
  afterEach(() => {
    try {
      TestBed.resetTestingModule();
    } finally {
      if (vi.isFakeTimers()) vi.clearAllTimers();
      vi.useRealTimers();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });
  it('keeps typing live and separates schools, districts and buildings', () => {
    component.input('kiểm thử');
    expect(component.search.set).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'kiểm thử',
        schoolId: undefined,
        propertyId: undefined,
        bounds: undefined,
      }),
    );
    component.begin();
    expect(new Set(component.options().map((option) => option.group))).toEqual(
      new Set(['Trường', 'Khu vực', 'Tòa nhà']),
    );
    const school = component.options().find((option) => option.group === 'Trường')!;
    const choose = vi.spyOn(component.search, 'school');
    component.select(school);
    expect(choose).toHaveBeenCalledWith(API_SCHOOLS[0].id);
    expect(component.search.filter().query).toBeUndefined();
  });
  it('maps building and district choices to the existing filter keys', () => {
    component.begin();
    component.select(component.options().find((option) => option.group === 'Tòa nhà')!);
    expect(component.search.filter().propertyId).toBe('property-test');
    component.begin();
    component.select(component.options().find((option) => option.group === 'Khu vực')!);
    expect(component.search.filter().district).toBe(API_ROOMS[2].district);
    expect(component.search.filter().propertyId).toBeUndefined();
  });
  it('supports arrow navigation, selection with Enter, Escape and no matches', () => {
    component.begin();
    component.keydown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(component.active()).toBe(component.options().length - 1);
    component.keydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(component.active()).toBe(0);
    component.keydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(component.search.filter().schoolId).toBe(API_SCHOOLS[0].id);
    component.input('không tồn tại xyz');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=status]').textContent).toContain(
      'Không tìm thấy',
    );
    component.keydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.open()).toBe(false);
  });
  it('reflects current query params and submits through the existing search method', async () => {
    component.search.filter.set({
      schoolId: API_SCHOOLS[0].id,
      maxPrice: 4900000,
      type: 'Studio',
      hasTour: true,
    });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('input').value).toBe(API_SCHOOLS[0].name);
    expect(
      fixture.nativeElement.querySelector('#home-budget').selectedOptions[0].textContent,
    ).toContain('4.900.000');
    expect(fixture.nativeElement.querySelector('.advanced').getAttribute('href')).toContain(
      'hasTour=1',
    );
    const submit = vi.spyOn(component.search, 'search').mockImplementation(() => {});
    fixture.nativeElement
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(submit).toHaveBeenCalled();
  });
});
