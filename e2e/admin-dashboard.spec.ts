import { test, expect, Page } from '@playwright/test';
import fs from 'node:fs';

async function login(page: Page) {
  await page.goto('/admin');
  await page.locator('#login-identifier').fill('admin123');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('123');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test('dashboard demo works without API, filters, confirms approvals and exports the selected month', async ({
  page,
}) => {
  const apiRequests: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);
  await expect(page.locator('.transaction')).toHaveCount(4);
  await expect(page.locator('.kpi').first()).toContainText('386.400.000');
  fs.mkdirSync('docs/screenshots', { recursive: true });
  await page.screenshot({
    path: 'docs/screenshots/admin-dashboard-reference-desktop.png',
    fullPage: true,
  });
  await page.getByLabel('Chọn tháng báo cáo').selectOption('2026-10');
  await expect(page.locator('.kpi').first()).toContainText('1.248.600.000');
  await page.getByLabel('Lọc giao dịch').selectOption('deposit');
  await expect(page.locator('.transaction')).toHaveCount(2);
  await page.getByRole('button', { name: 'Duyệt nhanh (2)' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Hủy', exact: true }).click();
  await expect(page.locator('.transaction')).toHaveCount(2);
  await page.getByRole('button', { name: 'Duyệt nhanh (2)' }).click();
  await page.getByRole('button', { name: 'Xác nhận duyệt mẫu' }).click();
  await expect(page.locator('.transaction')).toHaveCount(0);
  await expect(page.locator('.approvals h2')).toContainText('2 chờ duyệt');
  await expect(page.locator('.nav-count')).toHaveText('2');
  await page.getByRole('button', { name: 'Xem tất cả giao dịch' }).click();
  await expect(page.locator('.transaction')).toHaveCount(2);
  await page.getByRole('button', { name: 'Xuất báo cáo', exact: true }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Tải CSV / Excel' }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('ihouzz-dashboard-demo-2026-10.csv');
  const csv = fs.readFileSync((await download.path())!, 'utf8');
  expect(csv).toContain('1248600000');
  expect(csv).toContain('Giao dịch còn chờ duyệt;2');
  await page.getByRole('button', { name: 'Mở thông báo', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Thông báo vận hành');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.transaction')).toHaveCount(4);
  expect(apiRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('all Admin routes share one sidebar with exact Dashboard active state', async ({ page }) => {
  await login(page);
  const sidebar = page.locator('#admin-sidebar');
  const baseline = await sidebar.boundingBox();
  for (const [path, activePath] of [
    ['/admin', '/admin'],
    ['/admin/staff', '/admin/staff'],
    ['/admin/staff/schedule', '/admin/staff'],
    ['/admin/staff/new', '/admin/staff'],
    ['/admin/staff/performance', '/admin/staff'],
    ['/admin/rooms', '/admin/rooms'],
    ['/admin/rooms/new', '/admin/rooms'],
    ['/admin/rooms/new/duplicate', '/admin/rooms'],
    ['/admin/rooms/r1/edit', '/admin/rooms'],
    ['/admin/rooms/r1/images', '/admin/rooms'],
    ['/admin/approvals', '/admin/approvals'],
    ['/admin/payroll', '/admin/payroll'],
    ['/admin/reports', '/admin/reports'],
  ]) {
    await page.goto(path);
    await expect(sidebar).toHaveCount(1);
    await expect(sidebar.locator('a.active')).toHaveCount(1);
    await expect(sidebar.locator('a.active')).toHaveAttribute('href', activePath);
    const bounds = await sidebar.boundingBox();
    expect(bounds?.width).toBe(baseline?.width);
    expect(bounds?.x).toBe(baseline?.x);
    expect(bounds?.y).toBe(baseline?.y);
  }
  await sidebar.getByRole('link', { name: /Phê duyệt Cọc/ }).click();
  await expect(page).toHaveURL(/\/admin\/approvals$/);
  await expect(page.locator('.approvals-list')).toBeVisible();
  await sidebar.getByRole('link', { name: 'Bảng lương & Doanh thu' }).click();
  await expect(page).toHaveURL(/\/admin\/payroll$/);
});

test('mobile dashboard and Admin menu handle long content and large amounts', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.getByLabel('Chọn tháng báo cáo').selectOption('2026-10');
  await expect(page.locator('#admin-sidebar')).toBeHidden();
  await page.getByRole('button', { name: 'Đóng thông báo', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: 'docs/screenshots/admin-dashboard-reference-mobile.png',
    fullPage: true,
  });
  const toggle = page.getByRole('button', { name: 'Mở hoặc đóng menu Admin' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#admin-sidebar')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await page.locator('#admin-sidebar').getByRole('link', { name: 'Báo cáo & Cấu hình' }).click();
  await expect(page).toHaveURL(/\/admin\/reports$/);
  await expect(page.locator('#admin-sidebar')).toBeHidden();
  await toggle.click();
  await expect(page.locator('#admin-sidebar a.active')).toHaveAttribute('href', '/admin/reports');
  await page.locator('#admin-sidebar').getByRole('link', { name: 'Tổng quan Dashboard' }).click();
  await page.getByRole('button', { name: 'Duyệt Cọc & Khóa Phòng', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
