import { BackNavigationComponent } from './back-navigation/back-navigation';
import { CommonModule, registerLocaleData } from '@angular/common';
import localeVi from '@angular/common/locales/vi';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { BrandComponent } from './brand/brand';
import { DialogFocusDirective } from './dialog-focus.directive';
import { FormErrorComponent } from './form-error/form-error';
import { IconComponent } from './icon/icon';
import { ImageFallbackDirective } from './image-fallback.directive';
import { SearchSelectComponent } from './search-select/search-select';
import { StatusBadgeComponent } from './status-badge/status-badge';
import { ToastComponent } from './toast/toast';
import { RoomTypePipe, PolicyTypePipe, PolicyLevelPipe } from './display-pipes';
registerLocaleData(localeVi);
@NgModule({
  declarations: [
    BackNavigationComponent,
    RoomTypePipe,
    PolicyTypePipe,
    PolicyLevelPipe,
    SearchSelectComponent,
    ImageFallbackDirective,
    DialogFocusDirective,
    IconComponent,
    BrandComponent,
    StatusBadgeComponent,
    FormErrorComponent,
    ToastComponent,
  ],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule],
  exports: [
    BackNavigationComponent,
    RoomTypePipe,
    PolicyTypePipe,
    PolicyLevelPipe,
    SearchSelectComponent,
    ImageFallbackDirective,
    DialogFocusDirective,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    IconComponent,
    BrandComponent,
    StatusBadgeComponent,
    FormErrorComponent,
    ToastComponent,
  ],
})
export class SharedModule {}
