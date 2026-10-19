import { test, expect } from '@playwright/test';
import fs from 'node:fs';

test('Real OSM tiles, zoom/drag, school filter, property panel and back navigation', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const tileResponses: string[] = [];
  page.on('response', (r) => {
    if (r.url().includes('tile.openstreetmap.org') && r.status() === 200)
      tileResponses.push(r.url());
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible({ timeout: 20000 });
  await expect(page.locator('.building-marker, .building-cluster').first()).toBeVisible();
  const pane = page.locator('.leaflet-map-pane');
  const before = await pane.getAttribute('style');
  const box = (await page.locator('.map-canvas').boundingBox())!;
  await page.mouse.move(box.x + 220, box.y + 180);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 220, { steps: 8 });
  await page.mouse.up();
  await expect(pane).not.toHaveAttribute('style', before!);
  await page.locator('.leaflet-control-zoom-in').click();
  await page.locator('.leaflet-control-zoom-out').click();
  await page.getByRole('button', { name: 'Về khu vực ban đầu', exact: true }).click();
  await page.getByRole('button', { name: 'Tìm trong vùng bản đồ này' }).click();
  await expect(page).toHaveURL(/bounds=/);
  await page.getByRole('button', { name: /Xóa tất cả/ }).click();
  await page.getByRole('button', { name: /Trường gần đó:/ }).click();
  await page.getByLabel('Tìm trường gần đó').fill('tu nhien');
  await page
    .locator('app-search-select .options button')
    .filter({ hasText: 'Khoa học Tự nhiên' })
    .click();
  await expect(page).toHaveURL(/school=hcmus/);
  await expect(page.locator('.school-logo.selected')).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Thông tin trường' })).toBeVisible();
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  await page.waitForTimeout(650);
  await page.screenshot({ path: 'docs/screenshots/map-selected-school.png', fullPage: false });
  await page.getByRole('button', { name: 'Đóng thông tin trường' }).click();
  await page.getByRole('button', { name: 'Tòa The Nestro · minh họa', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Thông tin tòa nhà' });
  await expect(panel.locator('.map-room')).toHaveCount(5);
  await expect(page.locator('app-room-card .selected')).toHaveCount(5);
  await page.screenshot({ path: 'docs/screenshots/map-selected-property.png', fullPage: false });
  await panel.getByRole('link', { name: 'Xem chi tiết →' }).first().click();
  await expect(page).toHaveURL(/rooms\/r1\?from=/);
  await page.getByRole('button', { name: 'Mở thư viện ảnh phòng' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.gallery-nav')).toContainText('2 / 3');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.gallery-nav')).toContainText('1 / 3');
  await page.getByRole('button', { name: 'Chọn ảnh 3', exact: true }).click();
  await page.screenshot({ path: 'docs/screenshots/room-gallery-detail.png', fullPage: false });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: '← Quay lại' }).click();
  await expect(page).toHaveURL(/\/?school=hcmus/);
  expect(errors).toEqual([]);
  expect(tileResponses.length).toBeGreaterThan(0);
  fs.writeFileSync(
    'docs/map-network-validation.json',
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        provider: 'OpenStreetMap raster tiles',
        successfulTileRequests: tileResponses.length,
        examples: [...new Set(tileResponses)].slice(0, 3),
        note: 'Real network; no key; school coordinates sourced, properties illustrative.',
      },
      null,
      2,
    ),
  );
});

test('Hover photos, reduced motion, single-image room and safe direct-link return', async ({
  page,
}) => {
  await page.goto('/');
  const card = page.locator('app-room-card').first(),
    img = card.locator('.photo img');
  await card.locator('.photo').hover();
  await expect(img).toHaveAttribute('src', '/assets/rooms/r1-02.webp', { timeout: 2500 });
  await page.mouse.move(1, 1);
  await expect(img).toHaveAttribute('src', '/assets/rooms/r1-01.webp');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await card.locator('.photo').hover();
  await page.waitForTimeout(1600);
  await expect(img).toHaveAttribute('src', '/assets/rooms/r1-01.webp');
  await card.getByRole('button', { name: 'Ảnh tiếp theo của phòng' }).click();
  await expect(img).toHaveAttribute('src', '/assets/rooms/r1-02.webp');
  const single = page
    .locator('app-room-card')
    .filter({ has: page.locator('a.room-title', { hasText: 'CHDV đường số 2' }) });
  await expect(single.locator('.photo-controls')).toHaveCount(0);
  await page.goto('/rooms/r1?from=https://example.com');
  await page.getByRole('link', { name: '← Quay lại' }).click();
  await expect(page).toHaveURL(/\/rooms$/);
});

test('URL filters, validation, responsive layouts and tile failure fallback', async ({ page }) => {
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 950 });
    await page.goto('/');
    await expect(page.locator('app-room-card')).toHaveCount(12);
    await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible({ timeout: 20000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await page.screenshot({ path: `docs/screenshots/home-leaflet-${width}.png`, fullPage: true });
    if (width === 390)
      await page.screenshot({ path: 'docs/screenshots/home-mobile-top.png', fullPage: false });
  }
  await page.getByRole('button', { name: /^Bộ lọc/ }).click();
  await page.getByLabel('Giá từ (đ/tháng)', { exact: true }).fill('9000000');
  await page.getByLabel('Giá đến (đ/tháng)', { exact: true }).fill('4000000');
  await expect(page.getByRole('alert')).toContainText('Giá tối thiểu');
  await expect(page.getByRole('button', { name: 'Tìm phòng', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Xóa tất cả', exact: true }).click();
  await page.getByRole('combobox', { name: 'Loại phòng', exact: true }).selectOption('Duplex');
  await page.getByRole('button', { name: 'Đóng bộ lọc' }).click();
  await page.getByRole('button', { name: 'Tìm phòng', exact: true }).click();
  await expect(page).toHaveURL(/\/rooms\?type=Duplex/);
  await page.reload();
  await expect(page.locator('app-room-card')).toHaveCount(7);
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  await page.reload();
  await expect(page.locator('.map-error')).toBeVisible();
  await expect(page.locator('app-room-card')).toHaveCount(7);
});
