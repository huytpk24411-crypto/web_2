import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth-service';
@Component({
  selector: 'app-access-denied',
  standalone: false,
  templateUrl: './access-denied.html',
  styleUrl: './access-denied.css',
})
export class AccessDeniedComponent {
  readonly auth = inject(AuthService);
  private router = inject(Router);
  logout() {
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}
