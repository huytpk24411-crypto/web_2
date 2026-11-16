import { NgModule } from '@angular/core';
import { SharedModule } from '../shared/shared-module';
import { CustomerAboutComponent } from './customer-about/customer-about';
import { CustomerBookingNewComponent } from './customer-booking-new/customer-booking-new';
import { CustomerBookingReceiptComponent } from './customer-booking-receipt/customer-booking-receipt';
import { CustomerContactComponent } from './customer-contact/customer-contact';
import { CustomerFavoritesComponent } from './customer-favorites/customer-favorites';
import { CustomerHomeComponent } from './customer-home/customer-home';
import { HomeHeroCarouselComponent } from './customer-home/home-hero-carousel/home-hero-carousel';
import { HomeSearchComponent } from './customer-home/home-search/home-search';
import { HomeRevealDirective } from './customer-home/home-reveal.directive';
import { HomeBottomComponent } from './customer-home/home-bottom/home-bottom';
import { CustomerLayoutComponent } from './customer-layout/customer-layout';
import { CustomerRoomDetailComponent } from './customer-room-detail/customer-room-detail';
import { CustomerRoomListComponent } from './customer-room-list/customer-room-list';
import { CustomerRoutingModule } from './customer-routing-module';
import { CustomerViewingNewComponent } from './customer-viewing-new/customer-viewing-new';
import { CustomerHoldPolicyComponent } from './customer-hold-policy/customer-hold-policy';
import { CustomerBookingListComponent } from './customer-booking-list/customer-booking-list';

@NgModule({
  declarations: [
    CustomerLayoutComponent,
    CustomerBookingReceiptComponent,
    CustomerFavoritesComponent,
    CustomerBookingNewComponent,
    CustomerBookingListComponent,
    CustomerHoldPolicyComponent,
    CustomerHomeComponent,
    HomeHeroCarouselComponent,
    HomeSearchComponent,
    HomeRevealDirective,
    HomeBottomComponent,
    CustomerRoomDetailComponent,
    CustomerRoomListComponent,
    CustomerViewingNewComponent,
    CustomerAboutComponent,
    CustomerContactComponent,
  ],
  imports: [SharedModule, CustomerRoutingModule],
})
export class CustomerModule {}
