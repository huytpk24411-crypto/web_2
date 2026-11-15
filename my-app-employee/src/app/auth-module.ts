import { NgModule } from '@angular/core';
import { LoginComponent } from './login/login';
import { SharedModule } from './shared/shared-module';
import { AuthLayoutComponent } from './auth-layout/auth-layout';
@NgModule({
  declarations: [LoginComponent, AuthLayoutComponent],
  imports: [SharedModule],
})
export class AuthModule {}
