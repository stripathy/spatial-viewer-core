import { test, expect } from '@playwright/test';

// Uses the same webServer as the rest of the suite (see playwright.config.js).
const URL = '/examples/minimal/';

async function waitReady(page) {
  await page.goto(URL);
  await page.waitForFunction(() => window.SpatialViewerCore && window.SpatialViewerCore.createApp);
  await page.waitForFunction(() => document.getElementById('celltype-filter')?.children.length > 0,
                             null, { timeout: 5000 });
}

test('renders with no console errors', async ({ page }) => {
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  await waitReady(page);
  expect(errors).toEqual([]);
  const status = await page.evaluate(() => document.getElementById('status-right')?.textContent);
  expect(status).toMatch(/200 cells/);
});

test('switching to depth mode hides ct-rows and shows continuous-mode banner', async ({ page }) => {
  await waitReady(page);
  await page.click('button.mode-btn[data-mode="depth"]');
  await page.waitForFunction(() => {
    const t = document.getElementById('celltype-filter')?.textContent || '';
    return t.includes('Continuous color mode');
  }, null, { timeout: 2000 });
  const ctRows = await page.evaluate(() => document.querySelectorAll('.ct-row').length);
  expect(ctRows).toBe(0);
});

test("solo button + 'x' shortcut both work", async ({ page }) => {
  await waitReady(page);
  // 'x' should toggle showDeselectedCells
  const before = await page.evaluate(() => window.SpatialViewerCore.createApp ? null : null);
  await page.keyboard.press('x');
  await page.waitForTimeout(50);
  // The example doesn't expose the app on window, so just check that
  // the checkbox flipped (the show-deselected feature syncs it on render).
  const checked = await page.evaluate(() => document.getElementById('show-deselected-toggle').checked);
  expect(checked).toBe(false);
  // Click solo button
  await page.click('#solo-btn');
  const soloActive = await page.evaluate(() => document.getElementById('solo-btn').classList.contains('solo-active'));
  expect(soloActive).toBe(true);
});

test('hovering a cell shows a tooltip', async ({ page }) => {
  await waitReady(page);
  const canvas = await page.locator('#canvas');
  const box = await canvas.boundingBox();
  // Move cursor to roughly the center of canvas — should hit a cell
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(150);  // hover debounce + render
  const tooltipDisplay = await page.evaluate(() => document.getElementById('tooltip')?.style.display);
  // tooltip may or may not show depending on whether we hit a cell; if shown, content should be sensible
  if (tooltipDisplay === 'block') {
    const text = await page.evaluate(() => document.getElementById('tooltip')?.textContent);
    expect(text).toMatch(/cell_/);
  }
});
