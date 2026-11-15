import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from '../classes/auth.guard';
import { RoleGuard } from '../classes/role.guard';
import { CustomerAboutComponent } from './customer-about/customer-about';
import { CustomerBookingNewComponent } from './customer-booking-new/customer-booking-new';
import { CustomerBookingReceiptComponent } from './customer-booking-receipt/customer-booking-receipt';
import { CustomerContactComponent } from './customer-contact/customer-contact';
import { CustomerFavoritesComponent } from './customer-favorites/customer-favorites';
import { CustomerHomeComponent } from './customer-home/customer-home';
import { CustomerLayoutComponent } from './customer-layout/customer-layout';
import { CustomerRoomDetailComponent } from './customer-room-detail/customer-room-detail';
import { CustomerRoomListComponent } from './customer-room-list/customer-room-list';
import { CustomerViewingNewComponent } from './customer-viewing-new/customer-viewing-new';
const routes: Routes = [
  { path: '', component: CustomerHomeComponent, title: 'Trang chủ | iHOUZZ Uni' },
  { path: 'rooms', component: CustomerRoomListComponent, title: 'Tất cả phòng | iHOUZZ Uni' },
  {
    path: 'rooms/:id',
    component: CustomerRoomDetailComponent,
    title: 'Chi tiết phòng | iHOUZZ Uni',
  },
  {
    path: 'favorites',
    component: CustomerFavoritesComponent,
    title: 'Phòng yêu thích | iHOUZZ Uni',
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['CUSTOMER'] },
  },
  {
    path: 'bookings/new',
    component: CustomerBookingNewComponent,
    title: 'Giữ chỗ trực tuyến | iHOUZZ Uni',
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['CUSTOMER'] },
  },
  {
    path: 'bookings/:id/receipt',
    component: CustomerBookingReceiptComponent,
    title: 'Phiếu giữ chỗ | iHOUZZ Uni',
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['CUSTOMER'] },
  },
  {
    path: 'viewings/new',
    component: CustomerViewingNewComponent,
    title: 'Đặt lịch xem phòng | iHOUZZ Uni',
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['CUSTOMER'] },
  },
  {
    path: 'about',
    component: CustomerAboutComponent,
    title: 'Giới thiệu | iHOUZZ Uni',
  },
  {
    path: 'contact',
    component: CustomerContactComponent,
    title: 'Liên hệ | iHOUZZ Uni',
  },
];
@NgModule({
  imports: [
    RouterModule.forChild([{ path: '', component: CustomerLayoutComponent, children: routes }]),
  ],
  exports: [RouterModule],
})
export class CustomerRoutingModule {}
