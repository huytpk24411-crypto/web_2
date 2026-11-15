import { afterNextRender, Component, inject, Injector } from '@angular/core';

@Component({
  selector: 'app-auth-layout',
  standalone: false,
  templateUrl: './auth-layout.html',
  styleUrl: './auth-layout.css',
})
export class AuthLayoutComponent {
  private readonly injector = inject(Injector);
  private activated = false;
  private activeForm?: { focusFirstInput(): void };

  onActivate(component: { focusFirstInput(): void }): void {
    this.activeForm = component;
    if (this.activated) {
      afterNextRender(
        () => {
          if (this.activeForm === component) component.focusFirstInput();
        },
        { injector: this.injector },
      );
    }
    this.activated = true;
  }
}
