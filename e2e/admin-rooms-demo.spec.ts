import { test, expect, Page } from '@playwright/test';
import fs from 'node:fs';

async function login(page: Page) {
  await page.goto('/admin/rooms');
  await page.locator('#login-identifier').fill('admin123');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('123');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/rooms$/);
}
async function shot(page: Page, name: string) {
  fs.mkdirSync('docs/screenshots', { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  const screenshotStyle = await page.addStyleTag({
    content: '.room-footer { position: static !important; }',
  });
  await page.screenshot({ path: `docs/screenshots/rooms-demo-${name}.png`, fullPage: true });
  await screenshotStyle.evaluate((element) => element.remove());
}
async function state(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('ihouzz-demo-v1') || 'null'));
}

test('room list search, filters, paging, sorting, selection and CSV work without API', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url());
  });
  await page.setViewportSize({ width: 1760, height: 1050 });
  await login(page);
  await expect(page.locator('.data-table tbody tr')).toHaveCount(6);
  await expect(page.locator('.table-bottom')).toContainText('1–6 trên 12 phòng');
  await shot(page, 'list-desktop');
  await page.getByRole('button', { name: 'Trang tiếp theo', exact: true }).click();
  await expect(page.locator('.table-bottom')).toContainText('7–12 trên 12 phòng');
  await page.getByLabel('Tìm kiếm phòng quản trị').fill('NESTRO-402');
  await expect(page.locator('.data-table tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Xóa bộ lọc', exact: true }).click();
  await page.getByLabel('Trạng thái kinh doanh', { exact: true }).selectOption('HELD');
  await expect(page.locator('.data-table tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Xóa bộ lọc', exact: true }).click();
  await page.getByLabel('Sắp xếp phòng').selectOption('price-asc');
  await expect(page.locator('.data-table tbody tr').first()).toContainText('2.300.000');
  await page.getByRole('button', { name: 'Bộ lọc nâng cao', exact: true }).click();
  await page.getByLabel('Giá tối đa', { exact: true }).fill('4000000');
  await expect(page.locator('.data-table tbody tr')).toHaveCount(3);
  await page.getByLabel('Chọn tất cả phòng trên trang', { exact: true }).check();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Xuất các phòng đã chọn' }).click();
  const download = await downloadEvent;
  const csv = fs.readFileSync((await download.path())!, 'utf8');
  expect(csv).toContain('UNI-206');
  expect(csv).not.toContain('NESTRO-402');
  await page.getByRole('button', { name: 'Dạng thẻ', exact: true }).click();
  await expect(page.locator('.room-card-grid')).toBeVisible();
  await page.getByRole('button', { name: 'Xem tin phòng UNI-206', exact: true }).last().click();
  await expect(page.getByRole('dialog')).toContainText('Xem trước nội bộ');
  await page.keyboard.press('Escape');
  expect(requests).toEqual([]);
});

test('create validates required fields and duplicates, preserves draft, edits and saves room demo', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);
  await page.getByRole('link', { name: 'Thêm phòng mới', exact: true }).click();
  await shot(page, 'add');
  await page.getByRole('button', { name: 'Lưu & Đăng phòng', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('trường báo đỏ');
  await expect(page.locator('app-form-error .error').first()).toBeVisible();
  await page.getByLabel('Tên hiển thị của phòng *', { exact: true }).fill('Phòng Demo Kiểm Tra');
  await page.getByLabel('Mã phòng (Định danh) *', { exact: true }).fill('NESTRO-402');
  await page.getByLabel('Tòa nhà / Dự án *', { exact: true }).selectOption('p1');
  await page.getByLabel('Loại phòng *', { exact: true }).selectOption('Duplex');
  await page.getByLabel('Số phòng / Căn số *', { exact: true }).fill('999');
  await page.getByLabel('Giá thuê / tháng (VND) *', { exact: true }).fill('3900000');
  await page.getByRole('button', { name: 'Cọc bằng 1 tháng tiền phòng' }).click();
  await page.getByLabel('Diện tích sử dụng thực tế (m²) *', { exact: true }).fill('35');
  await page
    .getByLabel('Nội dung giới thiệu *', { exact: true })
    .fill('Phòng minh họa phục vụ kiểm tra giao diện quản trị.');
  await page.getByRole('button', { name: 'Thêm ảnh mẫu', exact: true }).click();
  await page.getByRole('button', { name: 'Lưu & Đăng phòng', exact: true }).click();
  await expect(page).toHaveURL(/new\/duplicate$/);
  await expect(page.getByRole('alert')).toContainText('TRÙNG LẶP DỮ LIỆU');
  await expect(page.getByLabel('Tên hiển thị của phòng *', { exact: true })).toHaveValue(
    'Phòng Demo Kiểm Tra',
  );
  await shot(page, 'duplicate');
  await page.getByLabel('Mã phòng (Định danh) *', { exact: true }).fill('DEMO-999');
  await page.getByLabel('Số phòng / Căn số *', { exact: true }).fill('402');
  await page.getByRole('button', { name: 'Lưu & Đăng phòng', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('TRÙNG LẶP DỮ LIỆU');
  await expect(page.getByText('Số căn đã tồn tại trong tòa nhà.', { exact: true })).toBeVisible();
  await page.getByLabel('Số phòng / Căn số *', { exact: true }).fill('999');
  await page.getByRole('button', { name: 'Lưu & Đăng phòng', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Cập nhật dữ liệu phòng thành công');
  await shot(page, 'complete');
  await page.getByRole('button', { name: 'Về danh sách phòng', exact: true }).click();
  await page.getByLabel('Tìm kiếm phòng quản trị').fill('DEMO-999');
  await expect(page.locator('.data-table tbody tr')).toHaveCount(1);
  await page.getByRole('link', { name: 'Sửa phòng DEMO-999', exact: true }).first().click();
  await expect(page.getByLabel('Mã phòng (Định danh) *', { exact: true })).toBeDisabled();
  await page.getByLabel('Giá thuê / tháng (VND) *', { exact: true }).fill('4200000');
  await shot(page, 'edit');
  await page.getByRole('button', { name: 'Cập nhật thay đổi', exact: true }).click();
  await page.getByRole('button', { name: 'Về danh sách phòng', exact: true }).click();
  await page.reload();
  const saved = (await state(page)).rooms.find(
    (room: { code: string }) => room.code === 'DEMO-999',
  );
  expect(saved.price).toBe(4200000);
  expect(saved.images).toHaveLength(3);
  expect(errors).toEqual([]);
});

test('gallery stages samples, cover, image removal and uploads; cancel discards and save persists', async ({
  page,
}) => {
  await login(page);
  await page.goto('/admin/rooms/r2/images');
  await expect(page.locator('.photo-grid article')).toHaveCount(3);
  await page.getByRole('button', { name: 'Thêm ảnh mẫu', exact: true }).click();
  await expect(page.locator('.photo-grid article')).toHaveCount(6);
  await page.getByRole('button', { name: 'Xem ảnh 2', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Hủy bỏ', exact: true }).click();
  await page.goto('/admin/rooms/r2/images');
  await expect(page.locator('.photo-grid article')).toHaveCount(3);
  await page.getByRole('button', { name: 'Thêm ảnh mẫu', exact: true }).click();
  await page.getByRole('button', { name: 'Xóa ảnh 6', exact: true }).click();
  await page.getByRole('button', { name: 'Đặt ảnh bìa', exact: true }).nth(1).click();
  await page.getByLabel('Chọn ảnh phòng', { exact: true }).setInputFiles({
    name: 'tiny.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aODsAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(page.locator('.photo-grid article')).toHaveCount(6);
  await shot(page, 'gallery');
  await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await page.getByRole('button', { name: 'Về danh sách phòng', exact: true }).click();
  await page.reload();
  const saved = (await state(page)).rooms.find((room: { id: string }) => room.id === 'r2');
  expect(saved.images).toHaveLength(6);
  expect(saved.images[0]).toBe('/assets/rooms/r2-02.webp');
  expect(saved.images[5]).toMatch(/^data:image\/png;base64,/);
});

test('hide, republish and delete have explicit confirmation and update persisted data', async ({
  page,
}) => {
  await login(page);
  await page.getByLabel('Tìm kiếm phòng quản trị').fill('NESTRO-402');
  await page.getByRole('button', { name: 'Ẩn hoặc xóa NESTRO-402', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Xóa vĩnh viễn', exact: true })).toHaveCount(0);
  await shot(page, 'hide-confirm');
  await page.getByRole('button', { name: 'Hủy bỏ / Quay lại', exact: true }).click();
  await page.getByRole('button', { name: 'Ẩn hoặc xóa NESTRO-402', exact: true }).first().click();
  await page.getByRole('button', { name: 'Xác nhận ẩn tin', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Đã ẩn tin phòng NESTRO-402');
  await shot(page, 'hide-toast');
  await page.getByRole('button', { name: 'Ẩn hoặc xóa NESTRO-402', exact: true }).first().click();
  await page.getByRole('button', { name: 'Xác nhận đăng lại', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Đã đăng lại phòng NESTRO-402');
  await page.getByLabel('Tìm kiếm phòng quản trị').fill('UNI-202');
  await page.getByRole('button', { name: 'Ẩn hoặc xóa UNI-202', exact: true }).first().click();
  await page.getByRole('radio', { name: /Xóa phòng vĩnh viễn/ }).check();
  await shot(page, 'delete-confirm');
  await page.getByRole('button', { name: 'Xóa vĩnh viễn', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Đã xóa phòng UNI-202');
  await expect(page.locator('.data-table tbody tr')).toHaveCount(0);
  await page.reload();
  expect((await state(page)).rooms.some((room: { id: string }) => room.id === 'r2')).toBe(false);
});

test('room list, forms, gallery and confirmation fit mobile and share the Admin sidebar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await expect(page.locator('.room-card-grid')).toBeVisible();
  await expect(page.locator('.table-wrap')).toBeHidden();
  await shot(page, 'list-mobile');
  for (const path of ['/admin/rooms/new', '/admin/rooms/r1/edit', '/admin/rooms/r1/images']) {
    await page.goto(path);
    await expect(page.locator('.room-admin').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Mở hoặc đóng menu Admin' }).click();
    await expect(page.locator('#admin-sidebar a.active')).toHaveAttribute('href', '/admin/rooms');
    await page.keyboard.press('Escape');
  }
  await shot(page, 'gallery-mobile');
  await page.goto('/admin/rooms');
  await page.getByRole('button', { name: 'Ẩn hoặc xóa NESTRO-402', exact: true }).last().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
