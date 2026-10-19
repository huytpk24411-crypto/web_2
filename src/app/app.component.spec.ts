import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppModule } from './app.module';
import { App } from './app.component';
describe('App', () => {
  it('khởi tạo ứng dụng NgModule', async () => {
    await TestBed.configureTestingModule({
      imports: [AppModule],
      providers: [provideRouter([])],
    }).compileComponents();
    expect(TestBed.createComponent(App).componentInstance).toBeTruthy();
  });
});
