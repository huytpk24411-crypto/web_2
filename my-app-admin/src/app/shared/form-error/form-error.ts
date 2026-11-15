import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { AbstractControl } from '@angular/forms';
@Component({
  selector: 'app-form-error',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.Default,
  templateUrl: './form-error.html',
  styleUrls: ['./form-error.css'],
})
export class FormErrorComponent {
  @Input() control: AbstractControl | null = null;
}
