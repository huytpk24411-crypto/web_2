import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { AppModule } from './app-module';
describe('App', () => {
  it('khởi tạo ứng dụng NgModule', async () => {
    await TestBed.configureTestingModule({
      imports: [AppModule],
      providers: [provideRouter([])],
    }).compileComponents();
    expect(TestBed.createComponent(App).componentInstance).toBeTruthy();
  });
});
