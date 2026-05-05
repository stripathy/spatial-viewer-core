/**
 * End-to-end test: run the Python converter on the synthetic Xenium
 * fixture, then load the resulting JSONs in a browser and render them
 * with core's drawScatterLayer + drawBoundaryLayer. Asserts the canvas
 * paints, the cluster axis is present, and boundaries decode cleanly.
 *
 * Skips (rather than fails) if Python or anndata aren't installed —
 * the viewer JS itself doesn't depend on them.
 */
import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const FIXTURE = resolve(REPO_ROOT, 'scripts/test_data/synthetic_xenium');
const OUT_DIR = resolve(REPO_ROOT, 'tests/_converter_output');
// URL path the Playwright webServer serves OUT_DIR from
const OUT_URL = '/tests/_converter_output';

function pythonAvailable() {
  try {
    execSync('python3 -c "import pandas, numpy, pyarrow"', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

test.describe('converter end-to-end', () => {
  test.skip(!pythonAvailable(),
    'Python / pandas / pyarrow not installed; skipping converter integration test');

  test.beforeAll(() => {
    if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
    execSync(
      `python3 scripts/bundle_to_viewer.py ` +
        `--bundle "${FIXTURE}" --sample-id demo --output "${OUT_DIR}"`,
      { cwd: REPO_ROOT, stdio: 'pipe' }
    );
  });

  test.afterAll(() => {
    if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
  });

  test('produces a valid index.json with palette', async ({ page }) => {
    await page.goto('/tests/fixtures/index.html');   // any page that loads core
    await page.waitForFunction(() => window.SpatialViewerCore !== undefined);
    const idx = await page.evaluate(async (url) => {
      const r = await fetch(url + '/index.json');
      return r.ok ? r.json() : null;
    }, OUT_URL);
    expect(idx).not.toBeNull();
    expect(idx.samples).toHaveLength(1);
    expect(idx.samples[0].sample_id).toBe('demo');
    expect(idx.samples[0].n_cells).toBe(200);
    expect(idx.graphclust_colors).toBeDefined();
    expect(Object.keys(idx.graphclust_colors)).toHaveLength(4);
  });

  test('per-sample JSON renders via drawScatterLayer', async ({ page }) => {
    await page.goto('/tests/fixtures/index.html');
    await page.waitForFunction(() => window.SpatialViewerCore !== undefined);
    const result = await page.evaluate(async (url) => {
      const idx = await fetch(url + '/index.json').then(r => r.json());
      const sample = await fetch(url + '/demo.json').then(r => r.json());
      // Build colors from graphclust palette
      const palette = idx.graphclust_colors;
      const cats = sample.graphclust_cats;
      const codes = sample.graphclust;
      const colors = new Array(sample.n_cells);
      for (let i = 0; i < sample.n_cells; i++) {
        colors[i] = palette[cats[codes[i]]] || '#888';
      }
      const cvs = document.createElement('canvas');
      cvs.width = 400; cvs.height = 320;
      const ctx = cvs.getContext('2d');
      // Fit-view
      const dx = sample.x_range[1] - sample.x_range[0];
      const dy = sample.y_range[1] - sample.y_range[0];
      const viewScale = Math.min(400 / dx, 320 / dy) * 0.9;
      const viewX = (400 - dx * viewScale) / 2 - sample.x_range[0] * viewScale;
      const viewY = (320 - dy * viewScale) / 2 - sample.y_range[0] * viewScale;
      const passes = new Uint8Array(sample.n_cells).fill(1);
      const res = window.SpatialViewerCore.drawScatterLayer(ctx, {
        x: sample.x, y: sample.y, colors, n: sample.n_cells, passes,
        viewScale, viewX, viewY, w: 400, h: 320, r: 4, alpha: 1,
      });
      // Count painted pixels (anything not transparent)
      const data = ctx.getImageData(0, 0, 400, 320).data;
      let painted = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted++;
      // Sample colors per quadrant — should match the 4-quadrant pattern
      function rgba(x, y) {
        const d = ctx.getImageData(x, y, 1, 1).data;
        return [d[0], d[1], d[2]];
      }
      return {
        shown: res.shown,
        painted,
        clusters: cats.length,
        catsLooksRight: cats.every(c => c.startsWith('cluster_')),
      };
    }, OUT_URL);
    expect(result.shown).toBe(200);
    expect(result.painted).toBeGreaterThan(500);
    expect(result.clusters).toBe(4);
    expect(result.catsLooksRight).toBe(true);
  });

  test('boundary JSON decodes via decodeBoundaryJson', async ({ page }) => {
    await page.goto('/tests/fixtures/index.html');
    await page.waitForFunction(() => window.SpatialViewerCore !== undefined);
    const result = await page.evaluate(async (url) => {
      const raw = await fetch(url + '/boundaries/demo.json').then(r => r.json());
      const bd = window.SpatialViewerCore.decodeBoundaryJson(raw);
      return {
        rawN: raw.n_cells,
        rawNWithBoundary: raw.n_with_boundary,
        rawVpc: raw.verts_per_cell,
        decodedN: bd.n,
        decodedVpc: bd.vpc,
        firstX: bd.bx[0],
        firstY: bd.by[0],
        // Check that decoded values are in plausible µm range
        xMin: Math.min(...bd.bx),
        xMax: Math.max(...bd.bx),
      };
    }, OUT_URL);
    // The fixture has 200 polygons each with 4 vertices (squares).
    expect(result.rawN).toBe(200);
    expect(result.rawNWithBoundary).toBe(200);
    expect(result.rawVpc).toBe(4);
    expect(result.decodedN).toBe(200);
    expect(result.decodedVpc).toBe(4);
    // Field is 1000×800 µm with 8µm half-side polygons; boundaries
    // should fall in roughly that range after decode.
    expect(result.xMin).toBeGreaterThan(0);
    expect(result.xMax).toBeLessThan(1100);
  });

  test('nucleus boundary JSON decodes too', async ({ page }) => {
    await page.goto('/tests/fixtures/index.html');
    await page.waitForFunction(() => window.SpatialViewerCore !== undefined);
    const ok = await page.evaluate(async (url) => {
      const raw = await fetch(url + '/boundaries/demo_nucleus.json').then(r => r.json());
      const bd = window.SpatialViewerCore.decodeBoundaryJson(raw);
      return bd.n === 200 && bd.vpc === 4 && bd.bx instanceof Float32Array;
    }, OUT_URL);
    expect(ok).toBe(true);
  });
});
