import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { AuthGuard, RoleGuard } from '../../guards/auth.guard';
import { AdminActionCompleteFrameComponent } from './admin-action-complete-frame/admin-action-complete-frame.component';
import { AdminAddRoomDuplicateFrameComponent } from './admin-add-room-duplicate-frame/admin-add-room-duplicate-frame.component';
import { AdminAddRoomFrameComponent } from './admin-add-room-frame/admin-add-room-frame.component';
import { AdminDashboardFrameComponent } from './admin-dashboard-frame/admin-dashboard-frame.component';
import { AdminShiftMonitorComponent } from './admin-shift-monitor/admin-shift-monitor.component';
import { AdminEditRoomFrameComponent } from './admin-edit-room-frame/admin-edit-room-frame.component';
import { AdminReportsComponent } from './admin-reports/admin-reports.component';
import { AdminApprovalsComponent } from './admin-approvals/admin-approvals.component';
import { AdminPayrollComponent } from './admin-payroll/admin-payroll.component';
import { AdminRoomDeleteConfirmFrameComponent } from './admin-room-delete-confirm-frame/admin-room-delete-confirm-frame.component';
import { AdminRoomDeleteToastFrameComponent } from './admin-room-delete-toast-frame/admin-room-delete-toast-frame.component';
import { AdminRoomImagesFrameComponent } from './admin-room-images-frame/admin-room-images-frame.component';
import { AdminRoomListFrameComponent } from './admin-room-list-frame/admin-room-list-frame.component';
import { AdminRoomPreviewComponent } from './admin-room-preview/admin-room-preview.component';
import { AdminRoomPhotoEditorComponent } from './admin-room-photo-editor/admin-room-photo-editor.component';
import { AdminStaffListFrameComponent } from './admin-staff-list-frame/admin-staff-list-frame.component';
import { RoomFormComponent } from './room-form/room-form.component';
import { StaffShiftAdjustmentComponent } from './staff-shift-adjustment/staff-shift-adjustment.component';
const routes: Routes = [
  { path: '', component: AdminDashboardFrameComponent, title: 'Tổng quan quản trị | iHOUZZ Uni' },
  { path: 'rooms', component: AdminRoomListFrameComponent, title: 'Quản lý phòng | iHOUZZ Uni' },
  {
    path: 'rooms/new/duplicate',
    component: AdminAddRoomDuplicateFrameComponent,
    title: 'Thông tin phòng trùng | iHOUZZ Uni',
  },
  {
    path: 'rooms/new',
    component: AdminAddRoomFrameComponent,
    title: 'Thêm phòng mới | iHOUZZ Uni',
  },
  {
    path: 'rooms/:id/edit',
    component: AdminEditRoomFrameComponent,
    title: 'Chỉnh sửa phòng | iHOUZZ Uni',
  },
  {
    path: 'rooms/:id/images',
    component: AdminRoomImagesFrameComponent,
    title: 'Quản lý ảnh | iHOUZZ Uni',
  },
  {
    path: 'staff',
    component: AdminStaffListFrameComponent,
    data: { staffView: 'list' },
    title: 'Danh sách nhân sự | iHOUZZ Uni',
  },
  {
    path: 'staff/new',
    component: AdminStaffListFrameComponent,
    data: { staffView: 'form' },
    title: 'Thêm nhân sự | iHOUZZ Uni',
  },
  {
    path: 'staff/schedule',
    component: AdminStaffListFrameComponent,
    data: { staffView: 'schedule' },
    title: 'Lịch làm việc & Ca trực | iHOUZZ Uni',
  },
  {
    path: 'staff/performance',
    component: AdminStaffListFrameComponent,
    data: { staffView: 'performance' },
    title: 'Theo dõi hiệu suất | iHOUZZ Uni',
  },
  {
    path: 'staff/:id/edit',
    component: AdminStaffListFrameComponent,
    data: { staffView: 'form' },
    title: 'Chỉnh sửa nhân sự | iHOUZZ Uni',
  },
  {
    path: 'staff/:id/success',
    component: AdminStaffListFrameComponent,
    data: { staffView: 'success' },
    title: 'Nhân sự đã tạo | iHOUZZ Uni',
  },
  {
    path: 'staff/:id',
    component: AdminStaffListFrameComponent,
    data: { staffView: 'detail' },
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
  declarations: [
    StaffShiftAdjustmentComponent,
    AdminActionCompleteFrameComponent,
    AdminAddRoomDuplicateFrameComponent,
    AdminAddRoomFrameComponent,
    AdminDashboardFrameComponent,
    AdminShiftMonitorComponent,
    AdminEditRoomFrameComponent,
    AdminReportsComponent,
    AdminApprovalsComponent,
    AdminPayrollComponent,
    AdminRoomDeleteConfirmFrameComponent,
    AdminRoomDeleteToastFrameComponent,
    AdminRoomImagesFrameComponent,
    AdminRoomListFrameComponent,
    AdminRoomPreviewComponent,
    AdminRoomPhotoEditorComponent,
    AdminStaffListFrameComponent,
    RoomFormComponent,
  ],
  imports: [SharedModule, RouterModule.forChild(routes)],
})
export class AdminModule {}
