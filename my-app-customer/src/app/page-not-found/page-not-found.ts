import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth-service';
@Component({
  selector: 'app-page-not-found',
  standalone: false,
  templateUrl: './page-not-found.html',
  styleUrl: './page-not-found.css',
})
export class PageNotFoundComponent {
  readonly auth = inject(AuthService);
  private router = inject(Router);
  logout() {
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}
