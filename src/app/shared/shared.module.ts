import { registerLocaleData } from '@angular/common';
import localeVi from '@angular/common/locales/vi';
registerLocaleData(localeVi);
import { DialogFocusDirective } from './dialog-focus.directive';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { IconComponent } from './icon/icon.component';
import { BrandComponent } from './brand/brand.component';
import { RoomCardComponent } from './room-card/room-card.component';
import { MapSearchComponent } from './map-search/map-search.component';
import { StatusBadgeComponent } from './status-badge/status-badge.component';
import { ReceiptPreviewComponent } from './receipt-preview/receipt-preview.component';
import { FormErrorComponent } from './form-error/form-error.component';
import { ToastComponent } from './toast/toast.component';
import { RoomFiltersComponent } from './room-filters/room-filters.component';
import { ImageFallbackDirective } from './image-fallback.directive';
import { RoomGalleryComponent } from './room-gallery/room-gallery.component';
import { SearchSelectComponent } from './search-select/search-select.component';
@NgModule({
  declarations: [
    SearchSelectComponent,
    RoomGalleryComponent,
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
    SearchSelectComponent,
    RoomGalleryComponent,
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
