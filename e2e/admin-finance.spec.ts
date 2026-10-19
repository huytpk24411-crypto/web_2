import { test, expect, Page } from '@playwright/test';
import fs from 'node:fs';

async function login(page: Page, path: string) {
  await page.goto(path);
  await page.locator('#login-identifier').fill('admin123');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('123');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(path + '$'));
}
async function screenshot(page: Page, name: string) {
  fs.mkdirSync('docs/screenshots', { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `docs/screenshots/admin-${name}.png`, fullPage: true });
}
function monitor(page: Page) {
  const errors: string[] = [],
    api: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) api.push(request.url());
  });
  return { errors, api };
}

test('approvals filter, inspect, request evidence, extend, reject and approve with confirmation', async ({
  page,
}) => {
  const log = monitor(page);
  await login(page, '/admin/approvals');
  await expect(page.locator('.approval-record')).toHaveCount(4);
  await screenshot(page, 'approvals-desktop');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Kiểm tra UNC', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('VietinBank');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Yêu cầu nộp bổ sung' }).click();
  await page.getByRole('button', { name: 'Xác nhận yêu cầu' }).click();
  await expect(page.getByRole('alert')).toContainText('Vui lòng nhập');
  await page.getByLabel('Nội dung xử lý hồ sơ').fill('Bổ sung thông tin người chuyển khoản');
  await page.getByRole('button', { name: 'Xác nhận yêu cầu' }).click();
  await expect(page.locator('.approval-record').first()).toContainText('Đang chờ bổ sung');
  await page.getByLabel('Tìm hồ sơ').fill('hoang dieu');
  await page.getByRole('button', { name: 'Áp dụng lọc' }).click();
  await expect(page.locator('.approval-record')).toHaveCount(1);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Xuất báo cáo giao dịch (Excel)' }).click();
  const csv = fs.readFileSync((await (await downloaded).path())!, 'utf8');
  expect(csv).toContain('PC-2026-HD403');
  expect(csv).not.toContain('PC-2026-HD408');
  await page.getByRole('button', { name: 'Duyệt Cọc & Khóa Phòng', exact: true }).click();
  await page.getByRole('button', { name: 'Hủy', exact: true }).click();
  await expect(page.locator('.approval-record')).toHaveCount(1);
  await page.getByRole('button', { name: 'Duyệt Cọc & Khóa Phòng', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận duyệt', exact: true }).click();
  await expect(page.locator('.approval-record')).toHaveCount(0);
  await expect(page.locator('.nav-count')).toHaveText('3');
  await page.getByRole('button', { name: 'Đặt lại bộ lọc' }).click();
  await page.getByRole('button', { name: 'Gia hạn 24h hỗ trợ sinh viên', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận gia hạn' }).click();
  await expect(
    page.getByRole('button', { name: 'Gia hạn 24h hỗ trợ sinh viên', exact: true }),
  ).toBeDisabled();
  await page
    .locator('.approval-record')
    .first()
    .getByRole('button', { name: 'Từ chối hồ sơ' })
    .click();
  await page.getByLabel('Nội dung xử lý hồ sơ').fill('Thông tin chuyển khoản không khớp');
  await page.getByRole('button', { name: 'Xác nhận từ chối' }).click();
  await expect(page.locator('.approval-record')).toHaveCount(2);
  await page.getByRole('button', { name: /Duyệt nhanh tất cả hợp lệ/ }).click();
  await page.getByRole('button', { name: 'Xác nhận duyệt', exact: true }).click();
  await expect(page.locator('.approval-record')).toHaveCount(0);
  await expect(page.locator('.nav-count')).toHaveText('0');
  await page.getByLabel('Trạng thái hồ sơ').selectOption('rejected');
  await page.getByRole('button', { name: 'Áp dụng lọc' }).click();
  await expect(page.locator('.approval-record')).toHaveCount(1);
  await page.getByRole('button', { name: '#PC-2026-HD408' }).click();
  await expect(page.getByRole('dialog')).toContainText('Thông tin chuyển khoản không khớp');
  expect(log.errors).toEqual([]);
  expect(log.api).toEqual([]);
});

test('payroll month, paging, status, employee approval, generation, closing and downloads', async ({
  page,
}) => {
  const log = monitor(page);
  await login(page, '/admin/payroll');
  await expect(page.locator('.payroll-table tbody tr')).toHaveCount(6);
  await screenshot(page, 'payroll-desktop');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Trang 2', exact: true }).click();
  await expect(page.locator('.payroll-table')).toContainText('Nguyễn Minh Anh');
  await page.getByLabel('Tìm nhân viên trong bảng lương').fill('le hoang nam');
  await expect(page.locator('.payroll-table tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: /Lê Hoàng Nam/ }).click();
  await expect(page.getByRole('dialog')).toContainText('12.070.000');
  await page.getByRole('button', { name: 'Duyệt phiếu lương này' }).click();
  await page.getByRole('button', { name: 'Đã duyệt (3)' }).click();
  await expect(page.locator('.payroll-table')).toContainText('Lê Hoàng Nam');
  await page.getByLabel('Tìm nhân viên trong bảng lương').fill('khong-co');
  await expect(page.locator('.empty-payroll')).toContainText('Không tìm thấy');
  await page.getByLabel('Chọn kỳ lương').selectOption('2026-04');
  await expect(page.locator('.empty-payroll')).toContainText('Chưa có bảng lương');
  await expect(page.locator('.finance-stat').first()).toContainText('412.800.000');
  await page.getByRole('button', { name: 'Tạo bảng lương', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận tạo bảng lương' }).click();
  await expect(page.locator('.payroll-table tbody tr')).toHaveCount(6);
  await page.getByRole('button', { name: 'Chốt & Ký duyệt Bảng Lương' }).click();
  await page.getByRole('button', { name: 'Xác nhận chốt bảng lương' }).click();
  await expect(page.getByRole('button', { name: 'Đã duyệt (18)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Chốt & Ký duyệt Bảng Lương' })).toBeDisabled();
  await page.getByRole('button', { name: 'Xuất Báo cáo (Excel/PDF)' }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tải CSV / Excel' }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe('ihouzz-bang-luong-2026-04.csv');
  const exported = fs.readFileSync((await download.path())!, 'utf8');
  expect(exported).toContain('04/2026');
  const total = exported
    .split('\r\n')
    .slice(1)
    .reduce((sum, line) => sum + Number(line.split(';')[9].replaceAll('"', '')), 0);
  expect(total).toBe(126080000);
  await page.getByRole('button', { name: 'Ủy nhiệm chi ngân hàng', exact: true }).click();
  const bank = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tạo ủy nhiệm chi mẫu' }).click();
  expect((await bank).suggestedFilename()).toContain('uy-nhiem-chi');
  await page.getByLabel('Chọn kỳ lương').selectOption('2026-03');
  await expect(page.getByRole('button', { name: 'Đã duyệt (3)' })).toBeVisible();
  expect(log.errors).toEqual([]);
  expect(log.api).toEqual([]);
});

test('config validates, saves and survives reload, switches work, reports export, backup and restore', async ({
  page,
}) => {
  const log = monitor(page);
  await login(page, '/admin/reports');
  await screenshot(page, 'reports-desktop');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel('Bán kính Check-in GPS', { exact: true }).fill('-1');
  await page.getByRole('button', { name: 'Lưu tất cả cấu hình' }).click();
  await expect(page.locator('.config-error')).toBeVisible();
  await page.getByLabel('Bán kính Check-in GPS', { exact: true }).fill('75');
  await page.getByRole('switch', { name: 'Tự động khấu trừ lương' }).click();
  await expect(page.locator('.config-save-status')).toContainText('Có thay đổi chưa lưu');
  await page.getByRole('button', { name: 'Lưu tất cả cấu hình' }).click();
  await expect(page.locator('.config-save-status')).toContainText('Đã lưu lúc');
  await page.reload();
  await expect(page.getByLabel('Bán kính Check-in GPS', { exact: true })).toHaveValue('75');
  await expect(page.getByRole('switch', { name: 'Tự động khấu trừ lương' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Sao lưu dữ liệu hệ thống (JSON)' }).click();
  const data = JSON.parse(fs.readFileSync((await (await downloaded).path())!, 'utf8'));
  expect(data.config.radius).toBe(75);
  expect(data.config.deduct).toBe(false);
  await page.getByRole('button', { name: 'Xem toàn bộ lịch sử thao tác' }).click();
  await expect(page.getByRole('dialog')).toContainText('Lưu cấu hình hệ thống');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '3. Tỷ lệ Lấp đầy & Doanh thu', exact: true }).click();
  await expect(page.locator('#config-occupancy')).toBeVisible();
  await page.getByRole('button', { name: 'Xem báo cáo', exact: true }).click();
  await page.getByLabel('Nhóm báo cáo', { exact: true }).selectOption('revenue');
  await expect(page.getByRole('dialog')).toContainText('386.400.000');
  const report = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Xuất báo cáo CSV / Excel' }).click();
  expect((await report).suggestedFilename()).toBe('ihouzz-bao-cao-revenue.csv');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '4. Phân quyền', exact: true }).click();
  await page.getByRole('switch', { name: 'Cho phép nhân viên xuất báo cáo' }).click();
  await expect(
    page.getByRole('switch', { name: 'Cho phép nhân viên xuất báo cáo' }),
  ).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Khôi phục mặc định', exact: false }).click();
  await page.getByRole('button', { name: 'Xác nhận khôi phục' }).click();
  await page.getByRole('button', { name: 'Lưu tất cả cấu hình' }).click();
  await expect(page.getByLabel('Bán kính Check-in GPS', { exact: true })).toHaveValue('50');
  expect(log.errors).toEqual([]);
  expect(log.api).toEqual([]);
});

test('three Admin pages fit desktop widths and keep all payroll columns visible', async ({
  page,
}) => {
  await login(page, '/admin/approvals');
  for (const width of [1290, 1536, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of ['approvals', 'payroll', 'reports']) {
      await page.goto('/admin/' + route);
      await expect(page.locator('.finance-page')).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        route + ' at ' + width,
      ).toBe(true);
      await expect(page.locator('#admin-sidebar a.active')).toHaveCount(1);
      if (route === 'payroll') {
        const fits = await page.locator('.payroll-table').evaluate((table) => {
          const parent = table.closest('.payroll-table-card')!.getBoundingClientRect();
          return Array.from(table.querySelectorAll('td,th')).every(
            (cell) => cell.getBoundingClientRect().right <= parent.right + 1,
          );
        });
        expect(fits, 'all seven payroll columns at ' + width).toBe(true);
      }
    }
  }
});
