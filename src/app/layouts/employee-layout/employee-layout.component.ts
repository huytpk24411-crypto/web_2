import { Component, inject, Input, Output, EventEmitter } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { DemoStore } from '../../services/demo-store.service';
import { ASSETS } from '../../data/assets';
import { Router } from '@angular/router';
@Component({
  selector: 'app-employee-layout',
  standalone: false,
  templateUrl: './employee-layout.component.html',
  styleUrls: ['./employee-layout.component.css'],
})
export class EmployeeLayoutComponent {
  auth = inject(AuthService);
  assets = ASSETS;
  private router = inject(Router);
  store = inject(DemoStore);
  logout() {
    this.auth.logout();
    this.router.navigate(['/']);
  }
}
