import { NgModule, provideBrowserGlobalErrorListeners, LOCALE_ID } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { registerLocaleData } from '@angular/common';
import localeVi from '@angular/common/locales/vi';
import { provideHttpClient } from '@angular/common/http';
import { AppRoutingModule } from './app-routing.module';
import { SharedModule } from './shared/shared.module';
import { App } from './app.component';
import { CustomerLayoutComponent } from './layouts/customer-layout/customer-layout.component';
import { EmployeeLayoutComponent } from './layouts/employee-layout/employee-layout.component';
import { AdminLayoutComponent } from './layouts/admin-layout/admin-layout.component';
registerLocaleData(localeVi);
@NgModule({
  declarations: [App, CustomerLayoutComponent, EmployeeLayoutComponent, AdminLayoutComponent],
  imports: [BrowserModule, SharedModule, AppRoutingModule],
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(),
    { provide: LOCALE_ID, useValue: 'vi' },
  ],
  bootstrap: [App],
})
export class AppModule {}
