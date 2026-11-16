import { BackNavigationService } from './shared/back-navigation/back-navigation-service';
import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import localeVi from '@angular/common/locales/vi';
import {
  inject,
  LOCALE_ID,
  NgModule,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AccessDeniedComponent } from './access-denied/access-denied';
import { App } from './app';
import { AppRoutingModule } from './app-routing-module';
import { AuthModule } from './auth-module';
import { PageNotFoundComponent } from './page-not-found/page-not-found';
import { SharedModule } from './shared/shared-module';
import { PropertyAPIService } from './services/property-apiservice';
import { RoomAPIService } from './services/room-apiservice';
import { AuthService, sessionInterceptor } from './services/auth-service';
import { RoomService } from './services/room-service';
import { SchoolAPIService } from './services/school-apiservice';
import { cleanupBrowserStorage } from './data/legacy-storage';
registerLocaleData(localeVi);
@NgModule({
  declarations: [App, AccessDeniedComponent, PageNotFoundComponent],
  imports: [BrowserModule, SharedModule, AuthModule, AppRoutingModule],
  providers: [
    provideAppInitializer(() => {
      inject(BackNavigationService);
    }),
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([sessionInterceptor])),
    provideAppInitializer(() => {
      cleanupBrowserStorage();
      return inject(AuthService).restoreApiSession();
    }),
    provideAppInitializer(() =>
      inject(RoomService).initializeCatalog(
        inject(RoomAPIService),
        inject(PropertyAPIService),
        inject(SchoolAPIService),
      ),
    ),
    { provide: LOCALE_ID, useValue: 'vi' },
  ],
  bootstrap: [App],
})
export class AppModule {}
