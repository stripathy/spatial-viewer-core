import { test, expect } from '@playwright/test';

const FIXTURE = '/tests/fixtures/index.html';

async function gotoAndWait(page) {
  await page.goto(FIXTURE);
  await page.waitForFunction(
    () => window.SpatialViewerCore
       && window.SpatialViewerCore.features
       && window.SpatialViewerCore.features.colorPicker,
    null,
    { timeout: 5000 }
  );
}

test.describe('color-picker — direct app methods', () => {
  test('app.setCellTypeColor calls adapter + emits event + requests render', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(async () => {
      const log = [];
      const adapter = {
        applyCellTypeColor: (mode, name, color) => log.push({ mode, name, color }),
      };
      const C = window.SpatialViewerCore;
      const app = C.createApp({ adapter });
      app.use(C.features.colorPicker);
      app.start();
      let renderCount = 0;
      app.on('render', () => renderCount++);
      let event = null;
      app.on('cellTypeColorChanged', (p) => { event = p; });
      app.setCellTypeColor('subclass', 'Pvalb', '#ff00ff');
      await Promise.resolve();
      app.destroy();
      return { log, event, renderCount };
    });
    expect(out.log).toEqual([{ mode: 'subclass', name: 'Pvalb', color: '#ff00ff' }]);
    expect(out.event).toEqual({ mode: 'subclass', name: 'Pvalb', color: '#ff00ff' });
    expect(out.renderCount).toBe(1);
  });

  test('app.setGeneColor calls adapter + emits event', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(async () => {
      const log = [];
      const adapter = {
        applyGeneColor: (gene, color) => log.push({ gene, color }),
      };
      const C = window.SpatialViewerCore;
      const app = C.createApp({ adapter });
      app.use(C.features.colorPicker);
      app.start();
      let event = null;
      app.on('geneColorChanged', (p) => { event = p; });
      app.setGeneColor('GAD1', '#0099ff');
      await Promise.resolve();
      app.destroy();
      return { log, event };
    });
    expect(out.log).toEqual([{ gene: 'GAD1', color: '#0099ff' }]);
    expect(out.event).toEqual({ gene: 'GAD1', color: '#0099ff' });
  });

  test('adapter without applyCellTypeColor: still emits + renders, no error', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(async () => {
      const C = window.SpatialViewerCore;
      const app = C.createApp({ adapter: {} });
      app.use(C.features.colorPicker);
      app.start();
      let event = null;
      app.on('cellTypeColorChanged', (p) => { event = p; });
      app.setCellTypeColor('subclass', 'Pvalb', '#ff0000');
      await Promise.resolve();
      app.destroy();
      return event;
    });
    expect(out).toEqual({ mode: 'subclass', name: 'Pvalb', color: '#ff0000' });
  });
});

test.describe('color-picker — event delegation', () => {
  test('input event on celltype swatch in #celltype-filter calls adapter', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const sidebar = document.createElement('div');
      sidebar.id = 'celltype-filter';
      document.body.appendChild(sidebar);
      const sw = document.createElement('input');
      sw.type = 'color';
      sw.value = '#aa00ff';
      sw.setAttribute('data-color-celltype', 'Pvalb');
      sw.setAttribute('data-color-mode', 'subclass');
      sidebar.appendChild(sw);

      const log = [];
      const adapter = {
        applyCellTypeColor: (mode, name, color) => log.push({ mode, name, color }),
      };
      const C = window.SpatialViewerCore;
      const app = C.createApp({ adapter });
      app.use(C.features.colorPicker);
      app.start();
      sw.dispatchEvent(new Event('input', { bubbles: true }));
      sidebar.remove();
      app.destroy();
      return log;
    });
    expect(out).toEqual([{ mode: 'subclass', name: 'Pvalb', color: '#aa00ff' }]);
  });

  test('falls back to app.state.colorMode when no data-color-mode attribute', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const sidebar = document.createElement('div');
      sidebar.id = 'celltype-filter';
      document.body.appendChild(sidebar);
      const sw = document.createElement('input');
      sw.type = 'color';
      sw.value = '#11ee44';
      sw.setAttribute('data-color-celltype', 'Sst');
      sidebar.appendChild(sw);

      const log = [];
      const adapter = {
        applyCellTypeColor: (mode, name, color) => log.push({ mode, name, color }),
      };
      const C = window.SpatialViewerCore;
      const app = C.createApp({ adapter, initialState: { colorMode: 'supertype' } });
      app.use(C.features.colorPicker);
      app.start();
      sw.dispatchEvent(new Event('input', { bubbles: true }));
      sidebar.remove();
      app.destroy();
      return log;
    });
    expect(out).toEqual([{ mode: 'supertype', name: 'Sst', color: '#11ee44' }]);
  });

  test('input event on gene swatch in #legend-overlay calls applyGeneColor', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const legend = document.createElement('div');
      legend.id = 'legend-overlay';
      document.body.appendChild(legend);
      const sw = document.createElement('input');
      sw.type = 'color';
      sw.value = '#cc0000';
      sw.setAttribute('data-color-gene', 'GAD1');
      legend.appendChild(sw);

      const log = [];
      const adapter = {
        applyGeneColor: (gene, color) => log.push({ gene, color }),
      };
      const C = window.SpatialViewerCore;
      const app = C.createApp({ adapter });
      app.use(C.features.colorPicker);
      app.start();
      sw.dispatchEvent(new Event('input', { bubbles: true }));
      legend.remove();
      app.destroy();
      return log;
    });
    expect(out).toEqual([{ gene: 'GAD1', color: '#cc0000' }]);
  });

  test('input event on a non-color input is ignored', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const sidebar = document.createElement('div');
      sidebar.id = 'celltype-filter';
      document.body.appendChild(sidebar);
      const text = document.createElement('input');
      text.type = 'text';
      text.setAttribute('data-color-celltype', 'Pvalb');
      sidebar.appendChild(text);

      let calls = 0;
      const adapter = { applyCellTypeColor: () => calls++ };
      const C = window.SpatialViewerCore;
      const app = C.createApp({ adapter });
      app.use(C.features.colorPicker);
      app.start();
      text.dispatchEvent(new Event('input', { bubbles: true }));
      sidebar.remove();
      app.destroy();
      return calls;
    });
    expect(out).toBe(0);
  });

  test('color input without data-color-* attributes is ignored', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const sidebar = document.createElement('div');
      sidebar.id = 'celltype-filter';
      document.body.appendChild(sidebar);
      const sw = document.createElement('input');
      sw.type = 'color';
      sidebar.appendChild(sw);

      let cellCalls = 0, geneCalls = 0;
      const adapter = {
        applyCellTypeColor: () => cellCalls++,
        applyGeneColor: () => geneCalls++,
      };
      const C = window.SpatialViewerCore;
      const app = C.createApp({ adapter });
      app.use(C.features.colorPicker);
      app.start();
      sw.dispatchEvent(new Event('input', { bubbles: true }));
      sidebar.remove();
      app.destroy();
      return { cellCalls, geneCalls };
    });
    expect(out).toEqual({ cellCalls: 0, geneCalls: 0 });
  });
});
