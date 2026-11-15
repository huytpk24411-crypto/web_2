import { NgModule } from '@angular/core';
import { SharedModule } from '../shared/shared-module';
import { AdminActionCompleteComponent } from './admin-action-complete/admin-action-complete';
import { AdminApprovalsComponent } from './admin-approvals/admin-approvals';
import { AdminDashboardComponent } from './admin-dashboard/admin-dashboard';
import { AdminLayoutComponent } from './admin-layout/admin-layout';
import { AdminPayrollComponent } from './admin-payroll/admin-payroll';
import { AdminReportsComponent } from './admin-reports/admin-reports';
import { AdminRoomDeleteConfirmComponent } from './admin-room-delete-confirm/admin-room-delete-confirm';
import { AdminRoomDeleteToastComponent } from './admin-room-delete-toast/admin-room-delete-toast';
import { AdminRoomDuplicateComponent } from './admin-room-duplicate/admin-room-duplicate';
import { AdminRoomEditComponent } from './admin-room-edit/admin-room-edit';
import { AdminRoomImagesComponent } from './admin-room-images/admin-room-images';
import { AdminRoomListComponent } from './admin-room-list/admin-room-list';
import { AdminRoomNewComponent } from './admin-room-new/admin-room-new';
import { AdminRoomPhotoEditorComponent } from './admin-room-photo-editor/admin-room-photo-editor';
import { AdminRoomPreviewComponent } from './admin-room-preview/admin-room-preview';
import { AdminRoutingModule } from './admin-routing-module';
import { AdminCatalogComponent } from './admin-catalog/admin-catalog';
import { AdminShiftMonitorComponent } from './admin-shift-monitor/admin-shift-monitor';
import { AdminStaffDetailComponent } from './admin-staff-detail/admin-staff-detail';
import { AdminStaffEditComponent } from './admin-staff-edit/admin-staff-edit';
import { AdminStaffListComponent } from './admin-staff-list/admin-staff-list';
import { AdminStaffNewComponent } from './admin-staff-new/admin-staff-new';
import { AdminStaffPerformanceComponent } from './admin-staff-performance/admin-staff-performance';
import { AdminStaffScheduleComponent } from './admin-staff-schedule/admin-staff-schedule';
import { AdminStaffSuccessComponent } from './admin-staff-success/admin-staff-success';
import { RoomFormComponent } from './room-form/room-form';
import { StaffFormComponent } from './staff-form/staff-form';
import { StaffShiftAdjustmentComponent } from './staff-shift-adjustment/staff-shift-adjustment';

@NgModule({
  declarations: [
    AdminCatalogComponent,
    AdminLayoutComponent,
    StaffShiftAdjustmentComponent,
    AdminActionCompleteComponent,
    AdminRoomDuplicateComponent,
    AdminRoomNewComponent,
    AdminDashboardComponent,
    AdminShiftMonitorComponent,
    AdminRoomEditComponent,
    AdminReportsComponent,
    AdminApprovalsComponent,
    AdminPayrollComponent,
    AdminRoomDeleteConfirmComponent,
    AdminRoomDeleteToastComponent,
    AdminRoomImagesComponent,
    AdminRoomListComponent,
    AdminRoomPreviewComponent,
    AdminRoomPhotoEditorComponent,
    AdminStaffListComponent,
    StaffFormComponent,
    AdminStaffNewComponent,
    AdminStaffEditComponent,
    AdminStaffSuccessComponent,
    AdminStaffDetailComponent,
    AdminStaffScheduleComponent,
    AdminStaffPerformanceComponent,
    RoomFormComponent,
  ],
  imports: [SharedModule, AdminRoutingModule],
})
export class AdminModule {}
