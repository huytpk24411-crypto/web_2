import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { AbstractControl } from '@angular/forms';
@Component({
  selector: 'app-form-error',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Default,
  templateUrl: './form-error.component.html',
  styleUrls: ['./form-error.component.css'],
})
export class FormErrorComponent {
  @Input() control: AbstractControl | null = null;
}
