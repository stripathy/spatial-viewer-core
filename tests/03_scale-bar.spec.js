import { test, expect } from '@playwright/test';

const FIXTURE = '/tests/fixtures/index.html';

async function gotoAndWait(page) {
  await page.goto(FIXTURE);
  await page.waitForFunction(
    () => window.SpatialViewerCore && typeof window.SpatialViewerCore.drawScaleBar === 'function',
    null,
    { timeout: 5000 }
  );
}

test.describe('drawScaleBar', () => {
  test('runs without throwing on a fresh offscreen canvas', async ({ page }) => {
    await gotoAndWait(page);
    const ok = await page.evaluate(() => {
      const cvs = document.createElement('canvas');
      cvs.width = 800; cvs.height = 600;
      const ctx = cvs.getContext('2d');
      window.SpatialViewerCore.drawScaleBar(ctx, {
        viewScale: 0.5, logicalWidth: 800, logicalHeight: 600,
      });
      return true;
    });
    expect(ok).toBe(true);
  });

  test('paints non-zero pixels in the lower-left region', async ({ page }) => {
    await gotoAndWait(page);
    const hits = await page.evaluate(() => {
      const cvs = document.createElement('canvas');
      cvs.width = 800; cvs.height = 600;
      const ctx = cvs.getContext('2d');
      window.SpatialViewerCore.drawScaleBar(ctx, {
        viewScale: 0.5, logicalWidth: 800, logicalHeight: 600,
      });
      // Sample a rectangle around where the bar should be drawn.
      // barY = 600 - 30 - 20 = 550. Bar starts at x=20.
      const data = ctx.getImageData(20, 540, 200, 30).data;
      let nonZero = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 0) nonZero++;
      }
      return nonZero;
    });
    expect(hits).toBeGreaterThan(100);
  });

  test('paints nothing in the upper-right region (away from bar)', async ({ page }) => {
    await gotoAndWait(page);
    const hits = await page.evaluate(() => {
      const cvs = document.createElement('canvas');
      cvs.width = 800; cvs.height = 600;
      const ctx = cvs.getContext('2d');
      window.SpatialViewerCore.drawScaleBar(ctx, {
        viewScale: 0.5, logicalWidth: 800, logicalHeight: 600,
      });
      const data = ctx.getImageData(600, 0, 200, 200).data;
      let nonZero = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 0) nonZero++;
      }
      return nonZero;
    });
    expect(hits).toBe(0);
  });

  test('label uses mm when nice value >= 1000 µm', async ({ page }) => {
    await gotoAndWait(page);
    // Stub fillText to capture the label that was drawn.
    const label = await page.evaluate(() => {
      const cvs = document.createElement('canvas');
      cvs.width = 800; cvs.height = 600;
      const ctx = cvs.getContext('2d');
      let captured = null;
      const origFillText = ctx.fillText.bind(ctx);
      ctx.fillText = function (text, x, y) {
        captured = text;
        return origFillText(text, x, y);
      };
      // viewScale = 0.05 px/µm → targetPx 150 / 0.05 = 3000 µm → snaps to 5000 µm = 5 mm
      window.SpatialViewerCore.drawScaleBar(ctx, {
        viewScale: 0.05, logicalWidth: 800, logicalHeight: 600,
      });
      return captured;
    });
    expect(label).toMatch(/mm$/);
  });

  test('label uses µm when nice value < 1000', async ({ page }) => {
    await gotoAndWait(page);
    const label = await page.evaluate(() => {
      const cvs = document.createElement('canvas');
      cvs.width = 800; cvs.height = 600;
      const ctx = cvs.getContext('2d');
      let captured = null;
      const origFillText = ctx.fillText.bind(ctx);
      ctx.fillText = function (text, x, y) {
        captured = text;
        return origFillText(text, x, y);
      };
      // viewScale = 3 px/µm → targetPx 150 / 3 = 50 µm. d=5 → snaps to 50 µm.
      window.SpatialViewerCore.drawScaleBar(ctx, {
        viewScale: 3, logicalWidth: 800, logicalHeight: 600,
      });
      return captured;
    });
    expect(label).toMatch(/µm$/);
    expect(label).toBe('50 µm');
  });

  test('honors custom padding + statusBarH', async ({ page }) => {
    await gotoAndWait(page);
    // With padding=50, the bar should NOT paint at x=20 anymore.
    const result = await page.evaluate(() => {
      const cvs = document.createElement('canvas');
      cvs.width = 800; cvs.height = 600;
      const ctx = cvs.getContext('2d');
      window.SpatialViewerCore.drawScaleBar(ctx, {
        viewScale: 0.5, logicalWidth: 800, logicalHeight: 600,
        padding: 50, statusBarH: 0,
      });
      // Strip from x=0..20 should be empty (padding pushed bar past it).
      const left = ctx.getImageData(0, 540, 20, 30).data;
      let leftHits = 0;
      for (let i = 0; i < left.length; i += 4) if (left[i + 3] > 0) leftHits++;
      // Around x=50 (new padding) there should be hits.
      const mid = ctx.getImageData(50, 570, 100, 20).data;
      let midHits = 0;
      for (let i = 0; i < mid.length; i += 4) if (mid[i + 3] > 0) midHits++;
      return { leftHits, midHits };
    });
    expect(result.leftHits).toBe(0);
    expect(result.midHits).toBeGreaterThan(0);
  });
});
