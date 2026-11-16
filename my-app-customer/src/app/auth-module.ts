import { ForgotPasswordComponent } from './forgot-password/forgot-password';
import { NgModule } from '@angular/core';
import { LoginComponent } from './login/login';
import { RegisterComponent } from './register/register';
import { SharedModule } from './shared/shared-module';
import { AuthLayoutComponent } from './auth-layout/auth-layout';
@NgModule({
  declarations: [ForgotPasswordComponent, LoginComponent, RegisterComponent, AuthLayoutComponent],
  imports: [SharedModule],
})
export class AuthModule {}
