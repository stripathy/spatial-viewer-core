import { test, expect } from '@playwright/test';

const FIXTURE = '/tests/fixtures/index.html';

async function gotoAndWait(page) {
  await page.goto(FIXTURE);
  await page.waitForFunction(
    () => window.SpatialViewerCore && typeof window.SpatialViewerCore.decodeBoundaryJson === 'function',
    null,
    { timeout: 5000 }
  );
}

test.describe('decodeBoundaryJson', () => {
  test('decodes a single triangle with offset + scale applied', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const raw = {
        n_cells: 1,
        verts_per_cell: 3,
        x_offset: 100, y_offset: 200,
        x_scale: 2, y_scale: 3,
        bx: [0, 1, 2],
        by: [0, 1, 2],
      };
      const bd = window.SpatialViewerCore.decodeBoundaryJson(raw);
      return {
        n: bd.n,
        vpc: bd.vpc,
        bx: Array.from(bd.bx),
        by: Array.from(bd.by),
        bxIsFloat32: bd.bx instanceof Float32Array,
        byIsFloat32: bd.by instanceof Float32Array,
      };
    });
    expect(out.n).toBe(1);
    expect(out.vpc).toBe(3);
    // bx[i] = raw.bx[i] * 2 + 100
    expect(out.bx).toEqual([100, 102, 104]);
    // by[i] = raw.by[i] * 3 + 200
    expect(out.by).toEqual([200, 203, 206]);
    expect(out.bxIsFloat32).toBe(true);
    expect(out.byIsFloat32).toBe(true);
  });

  test('handles 2 cells × 4 verts each (8 total)', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const raw = {
        n_cells: 2,
        verts_per_cell: 4,
        x_offset: 0, y_offset: 0,
        x_scale: 1, y_scale: 1,
        bx: [0, 1, 2, 3, 10, 11, 12, 13],
        by: [0, 0, 0, 0, 10, 10, 10, 10],
      };
      const bd = window.SpatialViewerCore.decodeBoundaryJson(raw);
      return {
        n: bd.n, vpc: bd.vpc,
        bx: Array.from(bd.bx),
        by: Array.from(bd.by),
      };
    });
    expect(out.n).toBe(2);
    expect(out.vpc).toBe(4);
    expect(out.bx).toEqual([0, 1, 2, 3, 10, 11, 12, 13]);
    expect(out.by).toEqual([0, 0, 0, 0, 10, 10, 10, 10]);
  });
});

test.describe('buildCellToBoundaryMap', () => {
  test('returns null when boundary data is missing', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const sample = { n_cells: 3, x: [0, 1, 2], y: [0, 0, 0] };
      return window.SpatialViewerCore.buildCellToBoundaryMap(null, sample);
    });
    expect(out).toBeNull();
  });

  test('returns null when sample data is missing', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const bd = { n: 1, vpc: 3, bx: new Float32Array([0, 1, 2]), by: new Float32Array([0, 1, 2]) };
      return window.SpatialViewerCore.buildCellToBoundaryMap(bd, null);
    });
    expect(out).toBeNull();
  });

  test('identity mapping when n_cells === n_bound', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const bd = {
        n: 3, vpc: 3,
        bx: new Float32Array([0, 1, 0, 10, 11, 10, 20, 21, 20]),
        by: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      };
      const sample = { n_cells: 3, x: [0, 10, 20], y: [0, 0, 0] };
      const map = window.SpatialViewerCore.buildCellToBoundaryMap(bd, sample);
      return Array.from(map);
    });
    expect(out).toEqual([0, 1, 2]);
  });

  test('matches cells to nearby centroids; -1 for unmatched', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      // 2 boundary polygons centered at (0,0) and (100,100); 3 cells where the
      // middle one has no nearby boundary.
      const bd = {
        n: 2, vpc: 4,
        bx: new Float32Array([-1, 1, 1, -1, 99, 101, 101, 99]),
        by: new Float32Array([-1, -1, 1, 1, 99, 99, 101, 101]),
      };
      const sample = {
        n_cells: 3,
        x: [0, 50, 100],
        y: [0, 50, 100],
      };
      const map = window.SpatialViewerCore.buildCellToBoundaryMap(bd, sample, { tol: 5 });
      return Array.from(map);
    });
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(-1);
    expect(out[2]).toBe(1);
  });

  test('honors a custom tolerance', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      // n_cells (2) != n_bound (1) so we hit the centroid-walk path.
      // Boundary centroid: ((-1+1+0)/3, (-1-1+2)/3) = (0, 0).
      // Cell 0 is 3 µm away; cell 1 is 0 µm away.
      const bd = {
        n: 1, vpc: 3,
        bx: new Float32Array([-1, 1, 0]),
        by: new Float32Array([-1, -1, 2]),
      };
      const sample = { n_cells: 2, x: [0, 0], y: [3, 0] };
      const tight = window.SpatialViewerCore.buildCellToBoundaryMap(bd, sample, { tol: 2 });
      const loose = window.SpatialViewerCore.buildCellToBoundaryMap(bd, sample, { tol: 10 });
      return { tight: Array.from(tight), loose: Array.from(loose) };
    });
    // tol=2: cell 0 misses (dist 3 ≥ 2), bi stays 0; cell 1 matches.
    expect(out.tight).toEqual([-1, 0]);
    // tol=10: cell 0 matches (dist 3 < 10); bi advances to nBound; cell 1 unmatched.
    expect(out.loose).toEqual([0, -1]);
  });
});
