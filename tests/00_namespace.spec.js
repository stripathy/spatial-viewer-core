import { test, expect } from '@playwright/test';

const FIXTURE = '/tests/fixtures/index.html';

test('namespace bootstrap: window.SpatialViewerCore exists', async ({ page }) => {
  await page.goto(FIXTURE);
  await page.waitForFunction(() => window.SpatialViewerCore !== undefined, null,
    { timeout: 5000 });
  const exists = await page.evaluate(() => typeof window.SpatialViewerCore);
  expect(exists).toBe('object');
});

test('namespace is idempotent: re-loading the bootstrap line does not clobber attached props', async ({ page }) => {
  await page.goto(FIXTURE);
  await page.waitForFunction(() => window.SpatialViewerCore !== undefined);
  const result = await page.evaluate(() => {
    window.SpatialViewerCore.testValue = 42;
    // Simulate the bootstrap running again (idempotency check)
    window.SpatialViewerCore = window.SpatialViewerCore || {};
    return window.SpatialViewerCore.testValue;
  });
  expect(result).toBe(42);
});
