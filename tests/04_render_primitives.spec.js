import { test, expect } from '@playwright/test';

const FIXTURE = '/tests/fixtures/index.html';

async function gotoAndWait(page) {
  await page.goto(FIXTURE);
  await page.waitForFunction(
    () => window.SpatialViewerCore && typeof window.SpatialViewerCore.drawScatterLayer === 'function',
    null,
    { timeout: 5000 }
  );
}

// Helper expression evaluated inside the page: builds a 4-cell synthetic
// dataset (red/green/blue/cyan in a 2×2 grid spaced 100µm apart at origin)
// and a fresh 200×200 canvas. Returns { ctx, opts, sampleAt }.
const PAGE_HELPERS = `
  (() => {
    window.__mkScene = function () {
      const cvs = document.createElement('canvas');
      cvs.width = 200; cvs.height = 200;
      const ctx = cvs.getContext('2d');
      // Cells at (50,50), (150,50), (50,150), (150,150) in canvas px when
      // viewScale=1, viewX=0, viewY=0. So data coords match canvas px here.
      const x = new Float32Array([50, 150, 50, 150]);
      const y = new Float32Array([50, 50, 150, 150]);
      const colors = ['#ff0000', '#00ff00', '#0000ff', '#00ffff'];
      const passes = new Uint8Array([1, 1, 1, 1]);
      return {
        cvs, ctx,
        base: { x, y, colors, n: 4, passes,
                viewScale: 1, viewX: 0, viewY: 0, w: 200, h: 200,
                r: 6, alpha: 1.0 },
        // Returns RGBA at given canvas px.
        sampleAt(px, py) {
          const d = ctx.getImageData(px, py, 1, 1).data;
          return { r: d[0], g: d[1], b: d[2], a: d[3] };
        },
      };
    };
    // 4-vert square boundary polygons (10 µm half-side) around each cell.
    window.__mkBoundary = function () {
      const bx = new Float32Array(16);
      const by = new Float32Array(16);
      const cents = [[50,50],[150,50],[50,150],[150,150]];
      for (let i = 0; i < 4; i++) {
        const [cx, cy] = cents[i];
        const base = i * 4;
        bx[base+0] = cx-10; by[base+0] = cy-10;
        bx[base+1] = cx+10; by[base+1] = cy-10;
        bx[base+2] = cx+10; by[base+2] = cy+10;
        bx[base+3] = cx-10; by[base+3] = cy+10;
      }
      return { n: 4, vpc: 4, bx, by };
    };
  })();
`;

test.describe('drawScatterLayer', () => {
  test('paints all 4 cells in the right colors', async ({ page }) => {
    await gotoAndWait(page);
    await page.addScriptTag({ content: PAGE_HELPERS });
    const out = await page.evaluate(() => {
      const s = window.__mkScene();
      const res = window.SpatialViewerCore.drawScatterLayer(s.ctx, s.base);
      return {
        shown: res.shown,
        c00: s.sampleAt(50, 50),    // red
        c10: s.sampleAt(150, 50),   // green
        c01: s.sampleAt(50, 150),   // blue
        c11: s.sampleAt(150, 150),  // cyan
        empty: s.sampleAt(100, 100),
      };
    });
    expect(out.shown).toBe(4);
    expect(out.c00.r).toBeGreaterThan(200); expect(out.c00.g).toBe(0);
    expect(out.c10.g).toBeGreaterThan(200); expect(out.c10.r).toBe(0);
    expect(out.c01.b).toBeGreaterThan(200); expect(out.c01.r).toBe(0);
    expect(out.c11.g).toBeGreaterThan(200); expect(out.c11.b).toBeGreaterThan(200);
    expect(out.empty.a).toBe(0);
  });

  test('passes mask: skips cells where passes[i]===0', async ({ page }) => {
    await gotoAndWait(page);
    await page.addScriptTag({ content: PAGE_HELPERS });
    const out = await page.evaluate(() => {
      const s = window.__mkScene();
      s.base.passes = new Uint8Array([1, 0, 0, 1]);  // skip green + blue
      const res = window.SpatialViewerCore.drawScatterLayer(s.ctx, s.base);
      return {
        shown: res.shown,
        red: s.sampleAt(50, 50).r,
        greenSpot: s.sampleAt(150, 50).a,
        blueSpot: s.sampleAt(50, 150).a,
      };
    });
    expect(out.shown).toBe(2);
    expect(out.red).toBeGreaterThan(200);
    expect(out.greenSpot).toBe(0);
    expect(out.blueSpot).toBe(0);
  });

  test('qcMask: skips cells where qcMask[i]>0', async ({ page }) => {
    await gotoAndWait(page);
    await page.addScriptTag({ content: PAGE_HELPERS });
    const out = await page.evaluate(() => {
      const s = window.__mkScene();
      s.base.qcMask = new Uint8Array([0, 1, 0, 0]);  // green is QC-fail
      const res = window.SpatialViewerCore.drawScatterLayer(s.ctx, s.base);
      return { shown: res.shown, greenSpot: s.sampleAt(150, 50).a };
    });
    expect(out.shown).toBe(3);
    expect(out.greenSpot).toBe(0);
  });

  test('viewport cull: cells offscreen are skipped', async ({ page }) => {
    await gotoAndWait(page);
    await page.addScriptTag({ content: PAGE_HELPERS });
    const out = await page.evaluate(() => {
      const s = window.__mkScene();
      // Translate the view so every cell is to the LEFT of the canvas.
      s.base.viewX = -1000;
      const res = window.SpatialViewerCore.drawScatterLayer(s.ctx, s.base);
      return res.shown;
    });
    expect(out).toBe(0);
  });

  test('alpha: globalAlpha is restored after the call', async ({ page }) => {
    await gotoAndWait(page);
    await page.addScriptTag({ content: PAGE_HELPERS });
    const finalAlpha = await page.evaluate(() => {
      const s = window.__mkScene();
      s.ctx.globalAlpha = 0.42;
      window.SpatialViewerCore.drawScatterLayer(s.ctx, { ...s.base, alpha: 0.5 });
      return s.ctx.globalAlpha;
    });
    expect(finalAlpha).toBeCloseTo(0.42, 5);
  });
});

test.describe('drawDimLayer', () => {
  test('scatter mode (useBoundaries=false): paints cells where passes[i]===0', async ({ page }) => {
    await gotoAndWait(page);
    await page.addScriptTag({ content: PAGE_HELPERS });
    const out = await page.evaluate(() => {
      const s = window.__mkScene();
      // Active cells are red/cyan; dim should paint green + blue.
      s.base.passes = new Uint8Array([1, 0, 0, 1]);
      s.base.useBoundaries = false;
      const res = window.SpatialViewerCore.drawDimLayer(s.ctx, s.base);
      return {
        shown: res.shown,
        greenSpot: s.sampleAt(150, 50).a,
        blueSpot: s.sampleAt(50, 150).a,
        redSpot: s.sampleAt(50, 50).a,
      };
    });
    expect(out.shown).toBe(2);
    expect(out.greenSpot).toBeGreaterThan(0);
    expect(out.blueSpot).toBeGreaterThan(0);
    expect(out.redSpot).toBe(0);
  });

  test('boundary mode: strokes polygons of cells where passes[i]===0', async ({ page }) => {
    await gotoAndWait(page);
    await page.addScriptTag({ content: PAGE_HELPERS });
    const out = await page.evaluate(() => {
      const s = window.__mkScene();
      const bd = window.__mkBoundary();
      s.base.passes = new Uint8Array([1, 0, 0, 1]);
      s.base.useBoundaries = true;
      s.base.boundaryData = bd;
      const res = window.SpatialViewerCore.drawDimLayer(s.ctx, s.base);
      // Stroke at edge of green's polygon (x=150, y=40 = top edge)
      return {
        shown: res.shown,
        greenEdge: s.sampleAt(150, 40).a,
        greenCenter: s.sampleAt(150, 50).a,  // not filled in stroke mode
      };
    });
    expect(out.shown).toBe(2);
    expect(out.greenEdge).toBeGreaterThan(0);
    // Stroke (not fill) — center should NOT be painted.
    expect(out.greenCenter).toBe(0);
  });
});

test.describe('drawBoundaryLayer', () => {
  test('fills polygons in cell colors', async ({ page }) => {
    await gotoAndWait(page);
    await page.addScriptTag({ content: PAGE_HELPERS });
    const out = await page.evaluate(() => {
      const s = window.__mkScene();
      s.base.boundaryData = window.__mkBoundary();
      const res = window.SpatialViewerCore.drawBoundaryLayer(s.ctx, s.base);
      return {
        shown: res.shown,
        red: s.sampleAt(50, 50),
        green: s.sampleAt(150, 50),
      };
    });
    expect(out.shown).toBe(4);
    expect(out.red.r).toBeGreaterThan(200);
    expect(out.green.g).toBeGreaterThan(200);
  });

  test('falls back to point fillRect for cells with bMap=-1', async ({ page }) => {
    await gotoAndWait(page);
    await page.addScriptTag({ content: PAGE_HELPERS });
    const out = await page.evaluate(() => {
      const s = window.__mkScene();
      s.base.boundaryData = window.__mkBoundary();
      // bMap: identity for cells 0,2,3 but cell 1 (green) has no polygon.
      s.base.bMap = new Int32Array([0, -1, 2, 3]);
      const res = window.SpatialViewerCore.drawBoundaryLayer(s.ctx, s.base);
      return {
        shown: res.shown,
        // Green still painted at centroid (point fallback).
        green: s.sampleAt(150, 50).g,
        // But not at the polygon edge of where green's polygon WOULD be.
        greenEdge: s.sampleAt(150, 41).a,
      };
    });
    expect(out.shown).toBe(4);
    expect(out.green).toBeGreaterThan(200);
    expect(out.greenEdge).toBe(0);
  });

  test('nucleusData adds an outline pass on top', async ({ page }) => {
    await gotoAndWait(page);
    await page.addScriptTag({ content: PAGE_HELPERS });
    const out = await page.evaluate(() => {
      const s = window.__mkScene();
      const bd = window.__mkBoundary();
      // Nuclei are smaller (5 µm half-side) inside the cells.
      const nbx = new Float32Array(16), nby = new Float32Array(16);
      const cents = [[50,50],[150,50],[50,150],[150,150]];
      for (let i = 0; i < 4; i++) {
        const [cx, cy] = cents[i];
        const base = i * 4;
        nbx[base+0]=cx-5; nby[base+0]=cy-5;
        nbx[base+1]=cx+5; nby[base+1]=cy-5;
        nbx[base+2]=cx+5; nby[base+2]=cy+5;
        nbx[base+3]=cx-5; nby[base+3]=cy+5;
      }
      const nd = { n: 4, vpc: 4, bx: nbx, by: nby };
      s.base.boundaryData = bd;
      s.base.nucleusData = nd;
      const res = window.SpatialViewerCore.drawBoundaryLayer(s.ctx, s.base);
      // Sample a pixel at the nucleus stroke edge (cell 0, x=50, y=45).
      return { shown: res.shown, nucleusEdge: s.sampleAt(50, 45) };
    });
    expect(out.shown).toBe(4);
    // Nucleus stroke is the cell's color over a filled cell of the same color.
    expect(out.nucleusEdge.r).toBeGreaterThan(200);
  });
});

test.describe('drawNucleusOnlyLayer', () => {
  test('paints centroid dots and nucleus outlines', async ({ page }) => {
    await gotoAndWait(page);
    await page.addScriptTag({ content: PAGE_HELPERS });
    const out = await page.evaluate(() => {
      const s = window.__mkScene();
      const bd = window.__mkBoundary();
      s.base.nucleusData = bd;
      const res = window.SpatialViewerCore.drawNucleusOnlyLayer(s.ctx, s.base);
      return {
        shown: res.shown,
        red: s.sampleAt(50, 50).r,        // centroid dot
        redEdge: s.sampleAt(50, 40).a,    // nucleus stroke top edge
        midGap: s.sampleAt(70, 50).a,     // gap between centroid + edge
      };
    });
    expect(out.shown).toBe(4);
    expect(out.red).toBeGreaterThan(200);
    expect(out.redEdge).toBeGreaterThan(0);
    expect(out.midGap).toBe(0);
  });
});

test.describe('drawTranscriptOverlay', () => {
  test('paints molecules in their gene colors', async ({ page }) => {
    await gotoAndWait(page);
    await page.addScriptTag({ content: PAGE_HELPERS });
    const out = await page.evaluate(() => {
      const s = window.__mkScene();
      const transcriptGenes = {
        GENEA: { x: new Float32Array([100]), y: new Float32Array([100]),
                 n: 1, color: '#ff00ff' },
        GENEB: { x: new Float32Array([60]),  y: new Float32Array([60]),
                 n: 1, color: '#ffff00' },
      };
      const res = window.SpatialViewerCore.drawTranscriptOverlay(s.ctx, {
        transcriptGenes,
        activeGenes: new Set(['GENEA', 'GENEB']),
        viewScale: 1, viewX: 0, viewY: 0, w: 200, h: 200,
        moleculeSize: 4, moleculeOpacity: 1, zoomRatio: 1,
      });
      return {
        shown: res.shown,
        magenta: s.sampleAt(100, 100),
        yellow: s.sampleAt(60, 60),
      };
    });
    expect(out.shown).toBe(2);
    expect(out.magenta.r).toBeGreaterThan(200);
    expect(out.magenta.b).toBeGreaterThan(200);
    expect(out.yellow.r).toBeGreaterThan(200);
    expect(out.yellow.g).toBeGreaterThan(200);
  });

  test('skips inactive genes', async ({ page }) => {
    await gotoAndWait(page);
    await page.addScriptTag({ content: PAGE_HELPERS });
    const shown = await page.evaluate(() => {
      const s = window.__mkScene();
      const transcriptGenes = {
        ACTIVE: { x: new Float32Array([100]), y: new Float32Array([100]),
                  n: 1, color: '#ff00ff' },
        INACTIVE: { x: new Float32Array([50]), y: new Float32Array([50]),
                    n: 1, color: '#00ff00' },
      };
      const res = window.SpatialViewerCore.drawTranscriptOverlay(s.ctx, {
        transcriptGenes,
        activeGenes: new Set(['ACTIVE']),
        viewScale: 1, viewX: 0, viewY: 0, w: 200, h: 200,
        moleculeSize: 4, moleculeOpacity: 1, zoomRatio: 1,
      });
      return res.shown;
    });
    expect(shown).toBe(1);
  });
});
