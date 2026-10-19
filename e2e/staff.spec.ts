import { test, expect, Page } from '@playwright/test';
import fs from 'node:fs';

const key = 'ihouzz-staff-demo-v1';
async function login(page: Page, path = '/admin/staff') {
  await page.goto(path);
  await page.locator('#login-identifier').fill('admin123');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('123');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(path + '$'));
}
async function shot(page: Page, name: string) {
  fs.mkdirSync('docs/screenshots', { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `docs/screenshots/staff-${name}.png`,
    fullPage: name !== 'deactivate-modal',
  });
}
async function state(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key);
}
async function createPeriod(page: Page) {
  await page.getByRole('button', { name: 'Tuần sau' }).click();
  await expect(page.locator('.staff-shift-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Tạo đợt đăng ký demo', exact: true }).click();
  await page.getByRole('button', { name: 'Tạo đợt và lịch tuần' }).click();
  await expect(page.locator('.staff-shift-card')).toHaveCount(14);
  await page.locator('.staff-shift-card').first().click();
}
async function register(page: Page, employee: string) {
  await page.getByLabel('Chọn nhân viên đăng ký').selectOption(employee);
  await page.getByRole('button', { name: 'Nhận chỗ', exact: true }).click();
}

test('adjustment dialog moves a registered employee, saves a receipt, and archive deletion updates the list', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page, '/admin/staff/schedule');
  await page.setViewportSize({ width: 1440, height: 1100 });
  await createPeriod(page);
  await register(page, 'staff-demo-1');
  const before = await state(page);
  const assignment = before.assignments.find(
    (a: any) => a.employeeId === 'staff-demo-1' && a.status === 'REGISTERED',
  );
  await page.getByRole('button', { name: 'Điều chỉnh lịch trực', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: /Điều chỉnh Ca trực/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Lưu điều chỉnh' })).toBeDisabled();
  await dialog.locator('.replacement-cell:not(:disabled)').first().click();
  await expect(dialog.locator('.valid')).toContainText('Hợp lệ');
  await page.screenshot({ path: 'docs/screenshots/staff-adjustment-dialog.png' });
  await dialog.getByRole('button', { name: 'Lưu điều chỉnh', exact: true }).click();
  await expect(
    dialog.getByRole('heading', { name: 'Cập nhật Lịch trực thành công!' }),
  ).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/staff-adjustment-success.png' });
  const downloadEvent = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Tải phiếu điều chỉnh (CSV)' }).click();
  const download = await downloadEvent;
  expect(fs.readFileSync((await download.path())!, 'utf8')).toContain('Mai An');
  const after = await state(page);
  expect(after.assignments.find((a: any) => a.id === assignment.id).status).toBe('CANCELLED');
  expect(after.assignments.find((a: any) => a.movedFromAssignmentId === assignment.id).status).toBe(
    'REGISTERED',
  );
  await dialog.getByRole('button', { name: 'Hoàn tất & Về bảng Lịch trực' }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('link', { name: /Danh sách nhân sự/ }).click();
  await page.getByRole('button', { name: 'Xóa Mai An', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('1 ca tương lai');
  await page.screenshot({ path: 'docs/screenshots/staff-delete-confirm.png' });
  await page.getByRole('button', { name: 'Xác nhận Xóa', exact: true }).click();
  await expect(page.locator('.staff-toast')).toContainText('Xóa thành công');
  await expect(page.locator('.staff-table tbody tr')).toHaveCount(5);
  await page.screenshot({ path: 'docs/screenshots/staff-delete-toast.png' });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Xóa Mai An', exact: true })).toHaveCount(0);
  expect(
    (await state(page)).employees.find((p: any) => p.id === 'staff-demo-1').archivedAt,
  ).toBeTruthy();
  expect(errors).toEqual([]);
});

test('staff profile: create, duplicate validation, success, edit, reload, search, export, reset', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);
  await shot(page, 'list-desktop');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await shot(page, 'list-wide');
  await page.setViewportSize({ width: 1345, height: 950 });
  await page.getByRole('button', { name: 'Thêm nhân sự mới' }).click();
  await page.locator('[name="fullName"]').fill('Demo Hà An');
  await page.locator('[name="birthDate"]').fill('2000-01-01');
  await page.locator('input[name="phone"]').fill('0000000099');
  await page.locator('[name="email"]').fill('nhanvien1@example.test');
  await page.locator('[name="position"]').selectOption({ label: 'Điều phối ca trực' });
  await page.locator('[name="workLocation"]').selectOption({ index: 1 });
  await page.locator('[name="startDate"]').fill('2026-01-01');
  await page.locator('[name="contractType"]').selectOption({ label: 'Thực tập' });
  await page.getByRole('button', { name: 'Lưu hồ sơ demo' }).click();
  await expect(page.getByRole('alert')).toContainText('đã được sử dụng');
  await expect(page.locator('.field-error')).toContainText('Email đã tồn tại');
  await shot(page, 'form-error');
  await page.locator('[name="email"]').fill('demo-ha-an@example.test');
  await shot(page, 'form-desktop');
  await page.getByRole('button', { name: 'Lưu hồ sơ demo' }).click();
  await expect(page).toHaveURL(/\/success$/);
  await expect(page.locator('.staff-success-summary')).toContainText('Demo Hà An');
  await shot(page, 'success');
  await page.getByRole('button', { name: 'Xem chi tiết', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Hồ sơ Nhân viên: Demo Hà An', exact: true }),
  ).toBeVisible();
  await shot(page, 'detail');
  await page.getByRole('button', { name: 'Sửa hồ sơ' }).click();
  await page.locator('[name="fullName"]').fill('Demo Hà An cập nhật');
  await page.getByRole('button', { name: 'Lưu hồ sơ demo' }).click();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Hồ sơ Nhân viên: Demo Hà An cập nhật', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: /Danh sách nhân sự/ }).click();
  await page.getByLabel('Sắp xếp nhân sự').selectOption('code');
  await expect(page.locator('.staff-table tbody tr')).toHaveCount(6);
  await page.getByRole('button', { name: 'Tiếp', exact: true }).click();
  await expect(page.locator('.staff-table tbody tr')).toHaveCount(1);
  await page.getByLabel('Lọc chức vụ').selectOption('Điều phối ca trực');
  await expect(page.locator('.staff-table tbody tr')).toHaveCount(2);
  await page.getByRole('button', { name: 'Xóa lọc', exact: true }).click();
  await page.getByLabel('Tìm nhân sự').fill('demo-ha-an@example.test');
  await expect(page.locator('.staff-table tbody tr')).toHaveCount(1);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Xuất danh sách CSV' }).click();
  const download = await downloadEvent;
  const csv = fs.readFileSync((await download.path())!, 'utf8');
  expect(csv).toContain('Demo Hà An cập nhật');
  expect(csv).not.toContain('nhanvien1@example.test');
  await page.getByLabel('Lọc trạng thái').selectOption('INACTIVE');
  await expect(page.getByRole('heading', { name: 'Không tìm thấy nhân sự' })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Đặt lại dữ liệu demo' }).click();
  await expect(page.locator('.staff-table tbody tr')).toHaveCount(6);
  await page.getByRole('button', { name: 'Xem Mai An', exact: true }).click();
  await shot(page, 'detail-populated');
  await page.getByRole('button', { name: 'Sửa hồ sơ' }).click();
  await shot(page, 'edit-desktop');
  expect(errors).toEqual([]);
});

test('staff shifts: explicit period, capacity, cancel, edit, shared task transfer and deactivation', async ({
  page,
}) => {
  await login(page, '/admin/staff/schedule');
  await createPeriod(page);
  for (const employee of ['staff-demo-1', 'staff-demo-2', 'staff-demo-3', 'staff-demo-4'])
    await register(page, employee);
  await expect(page.locator('.staff-capacity')).toContainText('4 / 4');
  await expect(page.getByRole('button', { name: 'Nhận chỗ', exact: true })).toBeDisabled();
  await page
    .locator('.staff-roster')
    .getByRole('button', { name: 'Hủy', exact: true })
    .last()
    .click();
  await expect(page.locator('.staff-capacity')).toContainText('3 / 4');
  await register(page, 'staff-demo-6');
  await expect(page.locator('.staff-shift-card').first()).not.toContainText('Cần bổ sung');
  await page.getByRole('button', { name: 'Sửa thông tin ca' }).click();
  await page.locator('.staff-shift-form').getByLabel('Nhãn ca').fill('Ca sáng demo sửa');
  await page.locator('.staff-shift-form').getByRole('button', { name: /Lưu/ }).click();
  await expect(page.locator('.staff-shift-detail')).toContainText('Ca sáng demo sửa');
  await page.locator('.staff-task-heading').getByRole('button', { name: 'Thêm công việc' }).click();
  await page.getByPlaceholder('Tên công việc').fill('Bàn giao demo');
  await page
    .getByLabel('Gán nhân viên')
    .selectOption([{ label: 'Mai An' }, { label: 'Minh Khoa' }]);
  await page.getByRole('button', { name: 'Lưu công việc' }).click();
  await page.locator('.staff-task-list').getByLabel('Mai An', { exact: true }).check();
  await expect(page.locator('.staff-task-list')).toContainText('1/2 hoàn thành');
  await page.locator('.staff-shift-card').nth(1).click();
  await register(page, 'staff-demo-2');
  await page.locator('.staff-shift-card').first().click();
  await page.getByLabel('Ca nhận công việc').selectOption({ index: 0 });
  // The placeholder may not be selected initially; choose the first actual receiving shift.
  const target = await page
    .getByLabel('Ca nhận công việc')
    .locator('option')
    .last()
    .getAttribute('value');
  await page.getByLabel('Ca nhận công việc').selectOption(target!);
  await page.getByRole('button', { name: 'Chuyển việc', exact: true }).click();
  await page.locator('.staff-shift-card').nth(1).click();
  await expect(page.locator('.staff-task-list')).toContainText('Đã chuyển 1 lần');
  await page.reload();
  await page.getByRole('button', { name: 'Tuần sau' }).click();
  await page.locator('.staff-shift-card').nth(1).click();
  await expect(page.locator('.staff-task-list')).toContainText('1/2 hoàn thành');
  await shot(page, 'schedule-desktop');
  await page.getByRole('link', { name: /Danh sách nhân sự/ }).click();
  await page.getByRole('button', { name: 'Xóa Minh Khoa', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('2 ca tương lai');
  await shot(page, 'deactivate-modal');
  await page.getByRole('button', { name: 'Chỉ ngừng hoạt động' }).click();
  const saved = await state(page);
  expect(saved.employees.find((item: any) => item.id === 'staff-demo-2').status).toBe('INACTIVE');
  expect(saved.tasks.find((item: any) => item.title === 'Bàn giao demo').needsReassignment).toBe(
    true,
  );
  expect(
    saved.assignments.filter(
      (item: any) => item.employeeId === 'staff-demo-2' && item.status === 'COMPLETED',
    ),
  ).toHaveLength(1);
});

test('staff attendance and KPI use saved check-in/check-out and period filters', async ({
  page,
}) => {
  await login(page, '/admin/staff/schedule');
  await createPeriod(page);
  await register(page, 'staff-demo-1');
  await page.goto('/admin/staff/staff-demo-1?tab=tasks');
  const row = page.locator('.staff-attendance tbody tr').last();
  await row.locator('input[type="time"]').fill('08:33');
  await row.getByRole('button', { name: 'Lưu giờ vào' }).click();
  await expect(row.getByRole('button', { name: 'Lưu giờ ra' })).toBeVisible();
  await row.locator('input[type="time"]').fill('12:30');
  await row.getByRole('button', { name: 'Lưu giờ ra' }).click();
  await expect(row).toContainText('Đã hoàn thành demo');
  await page.getByRole('button', { name: '← Quay lại danh sách', exact: true }).click();
  await page.getByRole('link', { name: 'Theo dõi hiệu suất', exact: true }).click();
  const period = (await state(page)).periods.at(-1);
  await page.getByLabel('Đợt / tuần').selectOption(period.id);
  await expect(page.locator('.staff-stats')).toContainText('100%');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByLabel('Đợt / tuần').selectOption('');
  await shot(page, 'performance-desktop');
  await page.setViewportSize({ width: 1280, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await shot(page, 'performance-1280');
  await page.getByLabel('Tìm nhân viên trong bảng hiệu suất').fill('Mai An');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByLabel('Tìm nhân viên trong bảng hiệu suất').fill('không có nhân viên này');
  await expect(page.locator('tbody tr')).toHaveCount(0);
});

test('existing customer, employee and room administration routes still render', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);
  const sidebar = await page.locator('.sidebar').boundingBox();
  await page.goto('/admin/rooms');
  expect((await page.locator('.sidebar').boundingBox())?.width).toBe(sidebar?.width);
  await expect(page.locator('app-admin-room-list-frame')).toBeVisible();
  await page.goto('/employee/shifts/register');
  await expect(page.locator('app-employee-shift-registration-frame')).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Phòng HOT', exact: true })).toBeVisible();
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await page.goto('/rooms/r1');
  await expect(page.locator('app-room-gallery')).toBeVisible();
  expect(errors).toEqual([]);
});
