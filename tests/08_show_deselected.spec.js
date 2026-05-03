import { test, expect } from '@playwright/test';

const FIXTURE = '/tests/fixtures/index.html';

async function gotoAndWait(page) {
  await page.goto(FIXTURE);
  await page.waitForFunction(
    () => window.SpatialViewerCore
       && window.SpatialViewerCore.features
       && window.SpatialViewerCore.features.showDeselected,
    null,
    { timeout: 5000 }
  );
}

test.describe('show-deselected feature', () => {
  test('initialState defaults showDeselectedCells=true', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const C = window.SpatialViewerCore;
      const app = C.createApp({ adapter: { isCellDeselected: () => false } });
      app.use(C.features.showDeselected);
      return app.state.showDeselectedCells;
    });
    expect(out).toBe(true);
  });

  test('viewer-supplied initialState overrides feature default', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const C = window.SpatialViewerCore;
      const app = C.createApp({
        adapter: {}, initialState: { showDeselectedCells: false },
      });
      app.use(C.features.showDeselected);
      return app.state.showDeselectedCells;
    });
    expect(out).toBe(false);
  });

  test("'x' keypress toggles state", async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(async () => {
      const C = window.SpatialViewerCore;
      const app = C.createApp({ adapter: {} });
      app.use(C.features.showDeselected);
      app.start();
      const v0 = app.state.showDeselectedCells;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
      const v1 = app.state.showDeselectedCells;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
      const v2 = app.state.showDeselectedCells;
      app.destroy();
      return [v0, v1, v2];
    });
    expect(out).toEqual([true, false, true]);
  });

  test("'X' (capital) also toggles", async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const C = window.SpatialViewerCore;
      const app = C.createApp({ adapter: {} });
      app.use(C.features.showDeselected);
      app.start();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'X' }));
      const v = app.state.showDeselectedCells;
      app.destroy();
      return v;
    });
    expect(out).toBe(false);
  });

  test("'x' inside an INPUT does NOT toggle", async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const C = window.SpatialViewerCore;
      const app = C.createApp({ adapter: {} });
      app.use(C.features.showDeselected);
      app.start();
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();
      // Dispatch the keydown ON the input so e.target is the input.
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
      const v = app.state.showDeselectedCells;
      input.remove();
      app.destroy();
      return v;
    });
    expect(out).toBe(true);  // unchanged
  });

  test('mounted: hooks the checkbox onchange', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = 'show-deselected-toggle';
      document.body.appendChild(cb);
      const C = window.SpatialViewerCore;
      const app = C.createApp({ adapter: {} });
      app.use(C.features.showDeselected);
      app.start();
      const initial = cb.checked;            // should reflect default true
      cb.checked = false;
      cb.onchange({ target: cb });
      const after = app.state.showDeselectedCells;
      cb.remove();
      app.destroy();
      return { initial, after };
    });
    expect(out).toEqual({ initial: true, after: false });
  });

  test("'x' keypress flips the checkbox visual state", async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(async () => {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = 'show-deselected-toggle';
      document.body.appendChild(cb);
      const C = window.SpatialViewerCore;
      const app = C.createApp({ adapter: {} });
      app.use(C.features.showDeselected);
      app.start();
      const before = cb.checked;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
      // The render hook updates the checkbox; wait one microtask for the batched render.
      await Promise.resolve();
      const after = cb.checked;
      cb.remove();
      app.destroy();
      return { before, after };
    });
    expect(out).toEqual({ before: true, after: false });
  });

  test('tooltipReady decorator adds badge when adapter says deselected', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const C = window.SpatialViewerCore;
      const adapter = { isCellDeselected: (idx) => idx === 7 };
      const app = C.createApp({ adapter });
      app.use(C.features.showDeselected);
      app.start();

      const evDeselected = { kind: 'cell', idx: 7, fields: { title: 'cell_7' } };
      app.emit('tooltipReady', evDeselected);

      const evNormal = { kind: 'cell', idx: 3, fields: { title: 'cell_3' } };
      app.emit('tooltipReady', evNormal);

      app.destroy();
      return {
        deselectedBadge: evDeselected.fields.badge,
        normalBadge: evNormal.fields.badge,
      };
    });
    expect(out.deselectedBadge).toBe('deselected');
    expect(out.normalBadge).toBeUndefined();
  });

  test('tooltipReady on molecules is ignored (kind != "cell")', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const C = window.SpatialViewerCore;
      const adapter = { isCellDeselected: () => true };
      const app = C.createApp({ adapter });
      app.use(C.features.showDeselected);
      app.start();
      const ev = { kind: 'molecule', idx: 0, fields: { title: 'GENE_X' } };
      app.emit('tooltipReady', ev);
      app.destroy();
      return ev.fields.badge;
    });
    expect(out).toBeUndefined();
  });
});
