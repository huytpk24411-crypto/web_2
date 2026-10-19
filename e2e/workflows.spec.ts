import { test, expect, Page } from '@playwright/test';
import fs from 'node:fs';

const tomorrow = new Date(Date.now() + 86400000).toISOString();
async function login(page: Page, username: string) {
  await page.goto('/login');
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('123');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
}
async function screenshot(page: Page, name: string) {
  fs.mkdirSync('docs/screenshots', { recursive: true });
  await page.screenshot({ path: `docs/screenshots/${name}.png`, fullPage: true });
}

test('Guest → yêu thích → đăng nhập → trở lại phòng; đặt lịch nhiều phòng & giữ chỗ', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Phòng HOT' })).toBeVisible();
  await screenshot(page, 'customer-home-desktop');
  await page.getByRole('button', { name: 'Thêm yêu thích Duplex The Nestro', exact: true }).click();
  await expect(page).toHaveURL(/register.*returnUrl/);
  await page.locator('.auth-switch').getByRole('link', { name: 'Đăng nhập' }).click();
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill('customer123');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('sai');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('không đúng');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('123');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(/\/rooms\/r1(?:\?|$)/);
  await expect(page.getByRole('button', { name: 'Đã yêu thích', exact: true })).toBeVisible();
  await screenshot(page, 'customer-room-detail');
  await page.getByRole('button', { name: 'ĐẶT LỊCH XEM PHÒNG', exact: true }).click();
  await expect(page).toHaveURL(/viewings\/new\?roomId=r1/);
  await page.locator('.pick-room').nth(1).click();
  await page.getByLabel('Ngày & giờ hẹn xem *').fill(tomorrow.slice(0, 16));
  await page.getByRole('button', { name: 'XÁC NHẬN ĐẶT LỊCH XEM PHÒNG MIỄN PHÍ' }).click();
  await expect(page.getByRole('status')).toContainText('Đặt lịch xem phòng thành công');
  await expect(page.locator('.viewing-row')).toContainText('2 phòng');
  await screenshot(page, 'customer-viewing-confirmed');
  await page.goto('/bookings/new?roomId=r1');
  await page.getByLabel('Ngày dự kiến nhận phòng *').fill(tomorrow.slice(0, 10));
  await page.getByRole('checkbox', { name: /Tôi đã đọc thông tin/ }).check();
  await page.getByRole('button', { name: 'Tạo yêu cầu giữ chỗ', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Xác nhận thanh toán mô phỏng' })).toBeEnabled();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('ihouzz-demo-v1')!));
  expect(before.bookings[0].status).toBe('PENDING');
  expect(before.bookings[0].expiresAt).toBeUndefined();
  await page.getByRole('button', { name: 'Xác nhận thanh toán mô phỏng' }).click();
  await expect(page).toHaveURL(/bookings\/hold-.*\/receipt/);
  await expect(page.getByText('Đã xác nhận giữ chỗ mô phỏng', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'In / Lưu PDF' })).toBeEnabled();
  await screenshot(page, 'customer-booking-receipt');
  await page.reload();
  await expect(page.getByText('Đã xác nhận giữ chỗ mô phỏng', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Đăng ký khách mới giữ ngữ cảnh, guards ngăn truy cập sai quyền', async ({ page }) => {
  await page.goto('/rooms/r3');
  await page.getByRole('button', { name: 'Yêu thích', exact: true }).click();
  await page.getByLabel('Họ và tên *', { exact: true }).fill('Khách Demo E2E');
  await page.getByLabel('Số điện thoại *', { exact: true }).fill('0905555555');
  await page.getByLabel('Mật khẩu *', { exact: true }).fill('test-demo');
  await page.getByLabel('Xác nhận mật khẩu *', { exact: true }).fill('test-demo');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
  await expect(page).toHaveURL(/\/rooms\/r3$/);
  await expect(page.getByRole('button', { name: 'Đã yêu thích', exact: true })).toBeVisible();
  const storage = await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }));
  expect(storage).not.toContain('test-demo');
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Bạn chưa có quyền truy cập' })).toBeVisible();
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await page.goto('/employee/payroll');
  await expect(page).toHaveURL(/login\?returnUrl/);
  await page.goto('/favorites');
  await expect(page).toHaveURL(/register\?returnUrl/);
});

test('Nhân viên đăng ký ca → check-in → công việc → check-out và bàn giao', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page, 'employee123');
  await expect(page).toHaveURL(/employee\/shifts\/register/);
  await screenshot(page, 'employee-shift-registration');
  await page.locator('.shift-card input').nth(0).check();
  await page.locator('.shift-card input').nth(1).check();
  await page.getByRole('button', { name: /Xác nhận đăng ký/ }).click();
  await expect(page.getByRole('status')).toContainText('Đăng ký ca thành công');
  await page.getByRole('link', { name: 'Lịch làm của tôi' }).click();
  await page
    .getByRole('link', { name: /Check-in đầu ca/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Dùng ảnh mẫu demo' }).click();
  await page.getByRole('button', { name: 'XÁC NHẬN CHECK-IN BẮT ĐẦU CA' }).click();
  await expect(page).toHaveURL(/employee\/shifts\/es-.*\/tasks/);
  await page.locator('.task-row input').first().check();
  await expect(page.locator('.task-row').first()).toContainText('Cá nhân: Đã xong');
  await screenshot(page, 'employee-tasks');
  await page.getByRole('link', { name: 'CHECK-OUT & BÀN GIAO CA' }).click();
  await page
    .getByLabel('Nội dung bàn giao *')
    .fill('Demo: tiếp tục xác nhận lịch xem và hồ sơ khách.');
  await page.getByLabel('Chuyển việc chưa xong đến ca').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Xác nhận check-out & bàn giao' }).click();
  await expect(page.getByRole('heading', { name: /Check-out thành công/ })).toBeVisible();
  await screenshot(page, 'employee-checkout');
  await page.getByRole('link', { name: 'Đi đến check-in' }).click();
  await page.getByRole('button', { name: 'Dùng ảnh mẫu demo' }).click();
  await page.getByRole('button', { name: 'XÁC NHẬN CHECK-IN BẮT ĐẦU CA' }).click();
  await expect(page.getByText('Được bàn giao từ ca trước').first()).toBeVisible();
  await page.goto('/employee/payroll');
  await expect(page.getByText('17.640.000').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('Nhân viên lập hồ sơ → tiền mặt/VietQR → giao dịch bỏ cọc', async ({ page }) => {
  await login(page, 'employee123');
  await page.goto('/employee/deposits/new?roomId=r2');
  await page.getByLabel('Họ và tên khách thuê *').fill('Khách Cọc Demo');
  await page.getByLabel('Số điện thoại liên hệ *').fill('0901234567');
  await page.getByLabel('Ngày bắt đầu thuê *').fill(tomorrow.slice(0, 10));
  await page.getByRole('radio', { name: /Nhận tiền mặt trực tiếp/ }).check();
  await page.getByRole('checkbox', { name: /Tôi đã kiểm tra thông tin/ }).check();
  await page.getByRole('button', { name: 'Tạo hồ sơ & đến xác nhận' }).click();
  await expect(page).toHaveURL(/cash-receipt/);
  await expect(page.getByRole('button', { name: 'In / Lưu PDF' })).toBeDisabled();
  await page.getByRole('checkbox', { name: /Tôi xác nhận đây là thao tác demo/ }).check();
  await page.getByRole('button', { name: 'Xác nhận nhận tiền mặt mô phỏng' }).click();
  await expect(page.getByRole('button', { name: 'In / Lưu PDF' })).toBeEnabled();
  await screenshot(page, 'employee-cash-receipt');
  await page.getByRole('link', { name: 'Chuyển khoản VietQR', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'XÁC NHẬN CỌC VIETQR & PHIẾU CỌC ĐIỆN TỬ' }),
  ).toBeVisible();
  await expect(page.locator('.receipt-paper h2')).toHaveText('PHIẾU THU CỌC TIỀN MẶT MÔ PHỎNG');
  await page.getByRole('link', { name: 'Đi đến quản lý giao dịch' }).click();
  await page.locator('.deal-card').filter({ hasText: 'Khách Cọc Demo' }).click();
  await page.getByRole('link', { name: /LỰA CHỌN 2: Khách bỏ cọc/ }).click();
  await page
    .getByLabel('Lý do khách không nhận phòng *')
    .fill('Khách thay đổi nhu cầu trong bản demo');
  await page.getByRole('checkbox', { name: /Tôi đã kiểm tra hồ sơ/ }).check();
  await page.getByRole('button', { name: 'Xác nhận khách bỏ cọc • Demo' }).click();
  await expect(page.getByRole('status')).toContainText('Đã ghi nhận khách bỏ cọc');
  await expect(page.getByRole('button', { name: 'In / PDF', exact: true })).toBeEnabled();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('ihouzz-demo-v1')!));
  expect(state.rooms.find((r: { id: string }) => r.id === 'r2').status).toBe('AVAILABLE');
  expect(state.payments.length).toBe(1);
});

test('Admin thêm phòng → lỗi trùng → sửa → ảnh → ẩn/xóa và kiểm tra nhân sự', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page, 'admin123');
  await expect(page).toHaveURL(/\/admin$/);
  await screenshot(page, 'admin-dashboard');
  await page.getByRole('link', { name: 'Quản lý Phòng & Tòa nhà', exact: true }).click();
  await screenshot(page, 'admin-room-list');
  await page.getByRole('link', { name: 'Thêm phòng mới', exact: true }).click();
  await page.getByLabel('Tên hiển thị của phòng *').fill('Phòng thử nghiệm E2E');
  await page.getByLabel('Mã phòng (Định danh) *').fill('NESTRO-402');
  await page.getByLabel('Số phòng / Căn số *').fill('999');
  await page.getByLabel('Địa chỉ chính xác *').fill('Đường Thống Nhất, Dĩ An');
  await page.getByLabel('Giá thuê / tháng (VND) *').fill('3900000');
  await page
    .getByLabel('Nội dung giới thiệu *')
    .fill('Phòng tạo thử để kiểm tra toàn bộ quy trình quản trị.');
  await page.getByRole('button', { name: 'Lưu & Đăng phòng' }).click();
  await expect(page).toHaveURL(/new\/duplicate/);
  await expect(page.getByRole('alert')).toContainText('Không thể tạo phòng mới');
  await screenshot(page, 'admin-duplicate-room');
  await page.getByLabel('Mã phòng (Định danh) *').fill('E2E-999');
  await page.getByRole('button', { name: 'Lưu & Đăng phòng' }).click();
  await expect(page.getByRole('dialog')).toContainText('Cập nhật dữ liệu phòng thành công');
  await screenshot(page, 'admin-action-complete');
  await page.getByRole('button', { name: 'Về danh sách phòng', exact: true }).click();
  await page.getByLabel('Tìm kiếm phòng quản trị').fill('E2E-999');
  await page.getByRole('link', { name: 'Sửa phòng E2E-999' }).click();
  await page.getByLabel('Giá thuê / tháng (VND) *').fill('4200000');
  await page.getByRole('button', { name: 'Cập nhật thay đổi' }).click();
  await page.getByRole('button', { name: 'Về danh sách phòng', exact: true }).click();
  await page.getByLabel('Tìm kiếm phòng quản trị').fill('NESTRO-402');
  await page.getByRole('link', { name: 'Quản lý ảnh NESTRO-402' }).click();
  await page.getByRole('button', { name: 'Đặt ảnh bìa', exact: true }).nth(1).click();
  await screenshot(page, 'admin-room-images');
  await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await page.getByRole('button', { name: 'Về danh sách phòng', exact: true }).click();
  await page.getByRole('button', { name: 'Ẩn hoặc xóa NESTRO-402' }).click();
  await expect(page.getByRole('button', { name: 'Xóa vĩnh viễn', exact: true })).toHaveCount(0);
  await screenshot(page, 'admin-room-delete-dialog');
  await page.getByRole('button', { name: 'Xác nhận ẩn tin' }).click();
  await expect(page.getByRole('status')).toContainText('Đã ẩn phòng NESTRO-402');
  await screenshot(page, 'admin-room-delete-toast');
  await page.getByLabel('Tìm kiếm phòng quản trị').fill('E2E-999');
  await page.getByRole('button', { name: 'Ẩn hoặc xóa E2E-999' }).click();
  await page.getByRole('button', { name: 'Xóa vĩnh viễn', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Đã xóa phòng E2E-999');
  await page.goto('/admin/staff');
  await expect(page.locator('tbody tr')).toHaveCount(6);
  await screenshot(page, 'admin-staff');
  await page.goto('/employee/shifts/register');
  await expect(page.getByRole('heading', { name: /Xin chào/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Responsive 390px không tràn ngang; lọc phòng và trạng thái rỗng', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/', '/rooms', '/rooms/r1', '/login', '/register']) {
    await page.goto(path);
    await expect(page.locator('app-root')).toBeVisible();
    const sizes = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(sizes.scroll, `Overflow at ${path}`).toBeLessThanOrEqual(sizes.width);
  }
  await page.goto('/');
  await screenshot(page, 'customer-home-mobile');
  await page.getByLabel('Từ khóa', { exact: true }).fill('Không có phòng này');
  await page.getByRole('button', { name: 'Tìm phòng', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Chưa tìm thấy phòng phù hợp' })).toBeVisible();
  await login(page, 'admin123');
  await page.goto('/admin/rooms');
  const sizes = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.width);
  await screenshot(page, 'admin-room-list-mobile');
});
