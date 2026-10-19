import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { SEED_ROOMS } from '../src/app/data/rooms';

test('customer rooms and map footer remain visible on desktop and mobile even without map tiles', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await expect(page.locator('app-room-card')).toHaveCount(7);
    await expect(page.locator('app-room-card .photo-current').first()).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator('app-room-card .photo-current')
          .first()
          .evaluate((img) => (img as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    const layout = await page.evaluate(() => {
      const caption = document.querySelector('.map-results-caption')!;
      const map = document.querySelector('.map-wrap')!.getBoundingClientRect();
      const box = caption.getBoundingClientRect();
      return {
        position: getComputedStyle(caption).position,
        top: box.top,
        mapBottom: map.bottom,
        right: box.right,
        scroll: document.documentElement.scrollWidth,
        width: innerWidth,
      };
    });
    expect(layout.position).toBe('static');
    expect(layout.top).toBeGreaterThanOrEqual(layout.mapBottom);
    expect(layout.right).toBeLessThanOrEqual(width);
    expect(layout.scroll).toBeLessThanOrEqual(width);
    await expect(
      page.getByText('Logo trường chỉ định vị cơ sở, không thể hiện quan hệ đối tác.', {
        exact: true,
      }),
    ).toHaveCount(0);
    fs.mkdirSync('docs/screenshots', { recursive: true });
    await page.screenshot({
      path: `docs/screenshots/customer-restored-${width}.png`,
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
});

test('legacy saved catalog recovers visible room cards while preserving hidden rooms and customer favorites', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate((rooms) => {
    localStorage.setItem(
      'ihouzz-demo-v1',
      JSON.stringify({
        catalogVersion: 4,
        rooms: rooms.map((room, index) => ({
          ...room,
          publicationStatus: index === 1 ? 'HIDDEN' : undefined,
          businessStatus: undefined,
        })),
        favorites: [{ customerId: 'customer1', roomId: 'r1' }],
        viewings: [],
        contactMessages: [],
        bookings: [],
        deposits: [],
        payments: [],
        employeeShifts: [],
        attendances: [],
        tasks: [],
        deals: [],
      }),
    );
  }, SEED_ROOMS);
  await page.reload();
  await expect(page.locator('app-room-card')).toHaveCount(6);
  await expect(page.locator('app-room-card').first()).toContainText('Duplex The Nestro');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ihouzz-demo-v1')!));
  expect(saved.catalogVersion).toBe(5);
  expect(saved.favorites).toEqual([{ customerId: 'customer1', roomId: 'r1' }]);
  expect(saved.rooms[1].publicationStatus).toBe('HIDDEN');
  await page.goto('/rooms');
  await expect(page.locator('app-room-card')).toHaveCount(6);
  await page.getByLabel('Từ khóa', { exact: true }).fill('khong-co-phong-nay');
  await expect(page.getByRole('heading', { name: 'Chưa tìm thấy phòng phù hợp' })).toBeVisible();
  await page.getByRole('button', { name: 'Xem tất cả phòng', exact: true }).click();
  await expect(page.locator('app-room-card')).toHaveCount(6);
  await page.reload();
  await expect(page.locator('app-room-card')).toHaveCount(6);
});

test('About mini-map retains its own caption positioning', async ({ page }) => {
  await page.goto('/about');
  const caption = page.locator('.mini-map .map-caption');
  await expect(caption).toBeVisible();
  expect(await caption.evaluate((el) => getComputedStyle(el).position)).toBe('absolute');
});
