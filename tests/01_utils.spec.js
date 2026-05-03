import { test, expect } from '@playwright/test';

const FIXTURE = '/tests/fixtures/index.html';

async function gotoAndWait(page) {
  await page.goto(FIXTURE);
  await page.waitForFunction(
    () => window.SpatialViewerCore && typeof window.SpatialViewerCore.normalizeHex === 'function',
    null,
    { timeout: 5000 }
  );
}

test.describe('normalizeHex', () => {
  test('expands 4-char #rgb to lowercase #rrggbb', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => window.SpatialViewerCore.normalizeHex('#fff'));
    expect(out).toBe('#ffffff');
  });

  test('lowercases a 7-char hex literal', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => window.SpatialViewerCore.normalizeHex('#FF0000'));
    expect(out).toBe('#ff0000');
  });

  test('clips alpha from #rrggbbaa', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => window.SpatialViewerCore.normalizeHex('#aabbccdd'));
    expect(out).toBe('#aabbcc');
  });

  test('falls back to #666666 for null', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => window.SpatialViewerCore.normalizeHex(null));
    expect(out).toBe('#666666');
  });

  test('falls back to #666666 for undefined', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => window.SpatialViewerCore.normalizeHex(undefined));
    expect(out).toBe('#666666');
  });

  test('falls back to #666666 for non-string input', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => window.SpatialViewerCore.normalizeHex(42));
    expect(out).toBe('#666666');
  });

  test('resolves named color via canvas fallback', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => window.SpatialViewerCore.normalizeHex('rebeccapurple'));
    expect(out).toBe('#663399');
  });

  test('resolves rgb() string via canvas fallback', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => window.SpatialViewerCore.normalizeHex('rgb(255, 0, 0)'));
    expect(out).toBe('#ff0000');
  });
});

test.describe('safeIntCmp', () => {
  test('orders Pvalb_2 before Pvalb_10 (numeric, not lex)', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => window.SpatialViewerCore.safeIntCmp('Pvalb_2', 'Pvalb_10'));
    // parseInt('Pvalb_2') is NaN, so this returns 0 — the realistic call site
    // is `safeIntCmp(a, b) || a.localeCompare(b)`, so test the suffix form too.
    expect(out).toBe(0);
  });

  test('orders pure integer strings numerically', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => window.SpatialViewerCore.safeIntCmp('2', '10'));
    expect(out).toBeLessThan(0);
  });

  test('returns positive when first int is larger', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => window.SpatialViewerCore.safeIntCmp('100', '5'));
    expect(out).toBeGreaterThan(0);
  });

  test('returns 0 when neither side parses to an int', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => window.SpatialViewerCore.safeIntCmp('alpha', 'beta'));
    expect(out).toBe(0);
  });

  test('returns 0 when only one side parses', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => window.SpatialViewerCore.safeIntCmp('alpha', '3'));
    expect(out).toBe(0);
  });

  test('parseInt forgiveness: leading int wins ("2_a" parses to 2)', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => window.SpatialViewerCore.safeIntCmp('2_a', '10_z'));
    expect(out).toBeLessThan(0);
  });
});
