import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { AuthGuard, RoleGuard } from '../../guards/auth.guard';
import { AccessDeniedComponent } from './access-denied/access-denied.component';
import { CustomerBookingReceiptFrameComponent } from './customer-booking-receipt-frame/customer-booking-receipt-frame.component';
import { CustomerFavoritesFrameComponent } from './customer-favorites-frame/customer-favorites-frame.component';
import { CustomerHoldPaymentFrameComponent } from './customer-hold-payment-frame/customer-hold-payment-frame.component';
import { CustomerHomeFrameComponent } from './customer-home-frame/customer-home-frame.component';
import { CustomerRoomDetailFrameComponent } from './customer-room-detail-frame/customer-room-detail-frame.component';
import { CustomerRoomListFrameComponent } from './customer-room-list-frame/customer-room-list-frame.component';
import { CustomerViewingScheduleFrameComponent } from './customer-viewing-schedule-frame/customer-viewing-schedule-frame.component';
import { InformationComponent } from './information/information.component';
import { NotFoundComponent } from './not-found/not-found.component';
const routes: Routes = [
  { path: '', component: CustomerHomeFrameComponent, title: 'Trang chủ | iHOUZZ Uni' },
  { path: 'rooms', component: CustomerRoomListFrameComponent, title: 'Tất cả phòng | iHOUZZ Uni' },
  {
    path: 'rooms/:id',
    component: CustomerRoomDetailFrameComponent,
    title: 'Chi tiết phòng | iHOUZZ Uni',
  },
  {
    path: 'favorites',
    component: CustomerFavoritesFrameComponent,
    title: 'Phòng yêu thích | iHOUZZ Uni',
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['CUSTOMER'] },
  },
  {
    path: 'bookings/new',
    component: CustomerHoldPaymentFrameComponent,
    title: 'Giữ chỗ trực tuyến | iHOUZZ Uni',
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['CUSTOMER'] },
  },
  {
    path: 'bookings/:id/receipt',
    component: CustomerBookingReceiptFrameComponent,
    title: 'Phiếu giữ chỗ | iHOUZZ Uni',
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['CUSTOMER'] },
  },
  {
    path: 'viewings/new',
    component: CustomerViewingScheduleFrameComponent,
    title: 'Đặt lịch xem phòng | iHOUZZ Uni',
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['CUSTOMER'] },
  },
  {
    path: 'about',
    component: InformationComponent,
    title: 'Giới thiệu | iHOUZZ Uni',
    data: { contact: false },
  },
  {
    path: 'contact',
    component: InformationComponent,
    title: 'Liên hệ | iHOUZZ Uni',
    data: { contact: true },
  },
  { path: 'access-denied', component: AccessDeniedComponent, title: 'Không có quyền | iHOUZZ Uni' },
  { path: '**', component: NotFoundComponent, title: 'Không tìm thấy | iHOUZZ Uni' },
];
@NgModule({
  declarations: [
    AccessDeniedComponent,
    CustomerBookingReceiptFrameComponent,
    CustomerFavoritesFrameComponent,
    CustomerHoldPaymentFrameComponent,
    CustomerHomeFrameComponent,
    CustomerRoomDetailFrameComponent,
    CustomerRoomListFrameComponent,
    CustomerViewingScheduleFrameComponent,
    InformationComponent,
    NotFoundComponent,
  ],
  imports: [SharedModule, RouterModule.forChild(routes)],
})
export class CustomerModule {}
