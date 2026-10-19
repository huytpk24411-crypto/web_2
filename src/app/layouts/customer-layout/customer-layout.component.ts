import { Component, inject, Input, Output, EventEmitter } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { FavoriteService } from '../../services/favorite.service';
import { DemoStore } from '../../services/demo-store.service';
import { Router } from '@angular/router';
@Component({
  selector: 'app-customer-layout',
  standalone: false,
  templateUrl: './customer-layout.component.html',
  styleUrls: ['./customer-layout.component.css'],
})
export class CustomerLayoutComponent {
  auth = inject(AuthService);
  favorites = inject(FavoriteService);
  store = inject(DemoStore);
  private router = inject(Router);
  menu = false;
  logout() {
    this.auth.logout();
    this.router.navigate(['/']);
  }
}
