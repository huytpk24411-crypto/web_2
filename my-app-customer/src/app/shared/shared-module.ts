import { BackNavigationComponent } from './back-navigation/back-navigation';
import { CommonModule, registerLocaleData } from '@angular/common';
import { CustomerFooterComponent } from './customer-footer/customer-footer';
import localeVi from '@angular/common/locales/vi';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { BrandComponent } from './brand/brand';
import { DialogFocusDirective } from './dialog-focus.directive';
import { FormErrorComponent } from './form-error/form-error';
import { IconComponent } from './icon/icon';
import { ImageFallbackDirective } from './image-fallback.directive';
import { MapSearchComponent } from './map-search/map-search';
import { ReceiptPreviewComponent } from './receipt-preview/receipt-preview';
import { RoomCardComponent } from './room-card/room-card';
import { RoomFiltersComponent } from './room-filters/room-filters';
import { RoomGalleryComponent } from './room-gallery/room-gallery';
import { RoomTourComponent } from './room-tour/room-tour';
import { SearchSelectComponent } from './search-select/search-select';
import { StatusBadgeComponent } from './status-badge/status-badge';
import { ToastComponent } from './toast/toast';
import { RoomTypePipe, PolicyTypePipe, PolicyLevelPipe } from './display-pipes';
registerLocaleData(localeVi);
@NgModule({
  declarations: [
    BackNavigationComponent,
    CustomerFooterComponent,
    RoomTypePipe,
    PolicyTypePipe,
    PolicyLevelPipe,
    SearchSelectComponent,
    RoomGalleryComponent,
    RoomTourComponent,
    RoomFiltersComponent,
    ImageFallbackDirective,
    DialogFocusDirective,
    IconComponent,
    BrandComponent,
    RoomCardComponent,
    MapSearchComponent,
    StatusBadgeComponent,
    ReceiptPreviewComponent,
    FormErrorComponent,
    ToastComponent,
  ],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule],
  exports: [
    BackNavigationComponent,
    CustomerFooterComponent,
    RoomTypePipe,
    PolicyTypePipe,
    PolicyLevelPipe,
    SearchSelectComponent,
    RoomGalleryComponent,
    RoomTourComponent,
    RoomFiltersComponent,
    ImageFallbackDirective,
    DialogFocusDirective,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    IconComponent,
    BrandComponent,
    RoomCardComponent,
    MapSearchComponent,
    StatusBadgeComponent,
    ReceiptPreviewComponent,
    FormErrorComponent,
    ToastComponent,
  ],
})
export class SharedModule {}
