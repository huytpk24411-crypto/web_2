import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminApprovalsComponent } from './admin-approvals/admin-approvals';
import { AdminDashboardComponent } from './admin-dashboard/admin-dashboard';
import { AdminLayoutComponent } from './admin-layout/admin-layout';
import { AdminPayrollComponent } from './admin-payroll/admin-payroll';
import { AdminReportsComponent } from './admin-reports/admin-reports';
import { AdminRoomDuplicateComponent } from './admin-room-duplicate/admin-room-duplicate';
import { AdminRoomEditComponent } from './admin-room-edit/admin-room-edit';
import { AdminRoomImagesComponent } from './admin-room-images/admin-room-images';
import { AdminRoomListComponent } from './admin-room-list/admin-room-list';
import { AdminRoomNewComponent } from './admin-room-new/admin-room-new';
import { AdminStaffDetailComponent } from './admin-staff-detail/admin-staff-detail';
import { AdminStaffEditComponent } from './admin-staff-edit/admin-staff-edit';
import { AdminStaffListComponent } from './admin-staff-list/admin-staff-list';
import { AdminStaffNewComponent } from './admin-staff-new/admin-staff-new';
import { AdminStaffPerformanceComponent } from './admin-staff-performance/admin-staff-performance';
import { AdminStaffScheduleComponent } from './admin-staff-schedule/admin-staff-schedule';
import { AdminStaffSuccessComponent } from './admin-staff-success/admin-staff-success';
import { AdminCatalogComponent } from './admin-catalog/admin-catalog';
const routes: Routes = [
  { path: 'catalog', component: AdminCatalogComponent, title: 'Quản lý danh mục | iHOUZZ Uni' },
  { path: 'catalog/:section', component: AdminCatalogComponent, title: 'Quản lý danh mục | iHOUZZ Uni' },
  { path: '', component: AdminDashboardComponent, title: 'Tổng quan quản trị | iHOUZZ Uni' },
  { path: 'rooms', component: AdminRoomListComponent, title: 'Quản lý phòng | iHOUZZ Uni' },
  {
    path: 'rooms/new/duplicate',
    component: AdminRoomDuplicateComponent,
    title: 'Thông tin phòng trùng | iHOUZZ Uni',
  },
  {
    path: 'rooms/new',
    component: AdminRoomNewComponent,
    title: 'Thêm phòng mới | iHOUZZ Uni',
  },
  {
    path: 'rooms/:id/edit',
    component: AdminRoomEditComponent,
    title: 'Chỉnh sửa phòng | iHOUZZ Uni',
  },
  {
    path: 'rooms/:id/images',
    component: AdminRoomImagesComponent,
    title: 'Quản lý ảnh | iHOUZZ Uni',
  },
  {
    path: 'staff',
    component: AdminStaffListComponent,
    title: 'Danh sách nhân sự | iHOUZZ Uni',
  },
  {
    path: 'staff/new',
    component: AdminStaffNewComponent,
    title: 'Thêm nhân sự | iHOUZZ Uni',
  },
  {
    path: 'staff/schedule',
    component: AdminStaffScheduleComponent,
    title: 'Lịch làm việc & Ca trực | iHOUZZ Uni',
  },
  {
    path: 'staff/performance',
    component: AdminStaffPerformanceComponent,
    title: 'Theo dõi hiệu suất | iHOUZZ Uni',
  },
  {
    path: 'staff/:id/edit',
    component: AdminStaffEditComponent,
    title: 'Chỉnh sửa nhân sự | iHOUZZ Uni',
  },
  {
    path: 'staff/:id/success',
    component: AdminStaffSuccessComponent,
    title: 'Nhân sự đã tạo | iHOUZZ Uni',
  },
  {
    path: 'staff/:id',
    component: AdminStaffDetailComponent,
    title: 'Chi tiết nhân sự | iHOUZZ Uni',
  },
  {
    path: 'approvals',
    component: AdminApprovalsComponent,
    title: 'Phê duyệt Cọc & Giao dịch | iHOUZZ Uni',
  },
  {
    path: 'payroll',
    component: AdminPayrollComponent,
    title: 'Bảng lương & Doanh thu | iHOUZZ Uni',
  },
  { path: 'reports', component: AdminReportsComponent, title: 'Báo cáo & Cấu hình | iHOUZZ Uni' },
];
@NgModule({
  imports: [
    RouterModule.forChild([{ path: '', component: AdminLayoutComponent, children: routes }]),
  ],
  exports: [RouterModule],
})
export class AdminRoutingModule {}
