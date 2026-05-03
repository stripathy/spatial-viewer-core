import { test, expect } from '@playwright/test';

const FIXTURE = '/tests/fixtures/index.html';

async function gotoAndWait(page) {
  await page.goto(FIXTURE);
  await page.waitForFunction(
    () => window.SpatialViewerCore && typeof window.SpatialViewerCore.hitTestCell === 'function',
    null,
    { timeout: 5000 }
  );
}

test.describe('hitTestMolecule', () => {
  test('returns null when no molecule is within threshold', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const transcriptGenes = {
        G: { x: new Float32Array([100]), y: new Float32Array([100]), n: 1, color: '#fff' },
      };
      return window.SpatialViewerCore.hitTestMolecule({
        mx: 0, my: 0,
        transcriptGenes, activeGenes: new Set(['G']),
        viewScale: 1, viewX: 0, viewY: 0, w: 200, h: 200,
        moleculeSize: 2,
      });
    });
    expect(out).toBeNull();
  });

  test('finds the closest molecule within threshold', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const transcriptGenes = {
        G: { x: new Float32Array([100, 50]), y: new Float32Array([100, 50]),
             n: 2, color: '#fff' },
      };
      return window.SpatialViewerCore.hitTestMolecule({
        mx: 100, my: 100,
        transcriptGenes, activeGenes: new Set(['G']),
        viewScale: 1, viewX: 0, viewY: 0, w: 200, h: 200,
        moleculeSize: 4,
      });
    });
    expect(out).not.toBeNull();
    expect(out.gene).toBe('G');
    expect(out.idx).toBe(0);
    expect(out.distSq).toBe(0);
  });

  test('picks closest across multiple genes', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const transcriptGenes = {
        FAR:   { x: new Float32Array([110]), y: new Float32Array([110]),
                 n: 1, color: '#fff' },
        NEAR:  { x: new Float32Array([102]), y: new Float32Array([100]),
                 n: 1, color: '#fff' },
      };
      return window.SpatialViewerCore.hitTestMolecule({
        mx: 100, my: 100,
        transcriptGenes, activeGenes: new Set(['FAR', 'NEAR']),
        viewScale: 1, viewX: 0, viewY: 0, w: 200, h: 200,
        moleculeSize: 4,
      });
    });
    expect(out.gene).toBe('NEAR');
  });

  test('skips genes not in activeGenes', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const transcriptGenes = {
        OFF: { x: new Float32Array([100]), y: new Float32Array([100]),
               n: 1, color: '#fff' },
      };
      return window.SpatialViewerCore.hitTestMolecule({
        mx: 100, my: 100,
        transcriptGenes, activeGenes: new Set(),
        viewScale: 1, viewX: 0, viewY: 0, w: 200, h: 200,
        moleculeSize: 4,
      });
    });
    expect(out).toBeNull();
  });
});

test.describe('hitTestCell — centroid mode', () => {
  test('returns null when no cell is within threshold', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      return window.SpatialViewerCore.hitTestCell({
        mx: 0, my: 0,
        x: new Float32Array([500]), y: new Float32Array([500]), n: 1,
        passes: new Uint8Array([1]),
        viewScale: 1, viewX: 0, viewY: 0,
        useBoundary: false, pointSize: 2,
      });
    });
    expect(out).toBeNull();
  });

  test('finds the closest centroid within threshold', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      return window.SpatialViewerCore.hitTestCell({
        mx: 100, my: 100,
        x: new Float32Array([95, 200]), y: new Float32Array([100, 100]), n: 2,
        passes: new Uint8Array([1, 1]),
        viewScale: 1, viewX: 0, viewY: 0,
        useBoundary: false, pointSize: 2,
      });
    });
    expect(out).not.toBeNull();
    expect(out.idx).toBe(0);
    expect(out.distSq).toBe(25);
    expect(out.isDeselected).toBe(false);
  });

  test('respects passes mask', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      // Cell 0 is closer but masked off; cell 1 should win.
      return window.SpatialViewerCore.hitTestCell({
        mx: 100, my: 100,
        x: new Float32Array([95, 105]), y: new Float32Array([100, 100]), n: 2,
        passes: new Uint8Array([0, 1]),
        viewScale: 1, viewX: 0, viewY: 0,
        useBoundary: false, pointSize: 2,
      });
    });
    expect(out.idx).toBe(1);
  });

  test('isDeselected echoes the input mask', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      return window.SpatialViewerCore.hitTestCell({
        mx: 100, my: 100,
        x: new Float32Array([100]), y: new Float32Array([100]), n: 1,
        passes: new Uint8Array([1]),
        isDeselected: new Uint8Array([1]),
        viewScale: 1, viewX: 0, viewY: 0,
        useBoundary: false, pointSize: 2,
      });
    });
    expect(out.idx).toBe(0);
    expect(out.isDeselected).toBe(true);
  });
});

test.describe('hitTestCell — boundary mode', () => {
  test('hit inside polygon returns the cell', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      // One cell at (100, 100) with a 20µm-wide square polygon.
      const bd = {
        n: 1, vpc: 4,
        bx: new Float32Array([90, 110, 110, 90]),
        by: new Float32Array([90, 90, 110, 110]),
      };
      return window.SpatialViewerCore.hitTestCell({
        mx: 100, my: 100,
        x: new Float32Array([100]), y: new Float32Array([100]), n: 1,
        passes: new Uint8Array([1]),
        viewScale: 1, viewX: 0, viewY: 0,
        useBoundary: true,
        boundaryData: bd,
      });
    });
    expect(out).not.toBeNull();
    expect(out.idx).toBe(0);
  });

  test('hit outside polygon (but within centroid pre-filter) returns null', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const bd = {
        n: 1, vpc: 4,
        bx: new Float32Array([90, 110, 110, 90]),
        by: new Float32Array([90, 90, 110, 110]),
      };
      // Mouse at (115, 100) — within 50µm of centroid but outside polygon.
      return window.SpatialViewerCore.hitTestCell({
        mx: 115, my: 100,
        x: new Float32Array([100]), y: new Float32Array([100]), n: 1,
        passes: new Uint8Array([1]),
        viewScale: 1, viewX: 0, viewY: 0,
        useBoundary: true,
        boundaryData: bd,
      });
    });
    expect(out).toBeNull();
  });

  test('overlapping polygons: nearest centroid wins', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      // Two cells with overlapping squares; mouse at (100,100); cell 1 centroid is closer.
      const bd = {
        n: 2, vpc: 4,
        bx: new Float32Array([80, 120, 120, 80,  90, 110, 110, 90]),
        by: new Float32Array([80, 80, 120, 120,  90, 90, 110, 110]),
      };
      return window.SpatialViewerCore.hitTestCell({
        mx: 100, my: 100,
        x: new Float32Array([85, 100]), y: new Float32Array([85, 100]), n: 2,
        passes: new Uint8Array([1, 1]),
        viewScale: 1, viewX: 0, viewY: 0,
        useBoundary: true,
        boundaryData: bd,
      });
    });
    expect(out.idx).toBe(1);
  });

  test('respects bMap (-1 entry skipped)', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const bd = {
        n: 1, vpc: 4,
        bx: new Float32Array([90, 110, 110, 90]),
        by: new Float32Array([90, 90, 110, 110]),
      };
      return window.SpatialViewerCore.hitTestCell({
        mx: 100, my: 100,
        x: new Float32Array([100, 100]), y: new Float32Array([100, 100]), n: 2,
        passes: new Uint8Array([1, 1]),
        bMap: new Int32Array([-1, 0]),
        viewScale: 1, viewX: 0, viewY: 0,
        useBoundary: true,
        boundaryData: bd,
      });
    });
    // Only cell 1 has a polygon → idx 1 wins.
    expect(out.idx).toBe(1);
  });
});
