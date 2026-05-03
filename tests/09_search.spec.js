import { test, expect } from '@playwright/test';

const FIXTURE = '/tests/fixtures/index.html';

async function gotoAndWait(page) {
  await page.goto(FIXTURE);
  await page.waitForFunction(
    () => window.SpatialViewerCore
       && window.SpatialViewerCore.features
       && window.SpatialViewerCore.features.cellTypeSearch
       && window.SpatialViewerCore.features.geneSearch,
    null,
    { timeout: 5000 }
  );
}

test.describe('cellTypeSearch feature', () => {
  test('initialState defaults filter to ""', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const C = window.SpatialViewerCore;
      const app = C.createApp({ adapter: {} });
      app.use(C.features.cellTypeSearch);
      return app.state.cellTypeSearchFilter;
    });
    expect(out).toBe('');
  });

  test('input typing updates state and calls adapter method', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const input = document.createElement('input');
      input.id = 'celltype-search';
      document.body.appendChild(input);
      const log = [];
      const adapter = { onCellTypeSearchChange: (v) => log.push(v) };
      const C = window.SpatialViewerCore;
      const app = C.createApp({ adapter });
      app.use(C.features.cellTypeSearch);
      app.start();
      input.value = 'Pvalb';
      input.oninput({ target: input });
      const state = app.state.cellTypeSearchFilter;
      input.remove();
      app.destroy();
      return { state, log };
    });
    expect(out.state).toBe('pvalb');
    expect(out.log).toEqual(['pvalb']);
  });

  test('emits searchChanged event', async ({ page }) => {
    await gotoAndWait(page);
    const captured = await page.evaluate(() => {
      const input = document.createElement('input');
      input.id = 'celltype-search';
      document.body.appendChild(input);
      const C = window.SpatialViewerCore;
      const app = C.createApp({ adapter: {} });
      app.use(C.features.cellTypeSearch);
      app.start();
      let received = null;
      app.on('searchChanged', (p) => { received = p; });
      input.value = 'sst';
      input.oninput({ target: input });
      input.remove();
      app.destroy();
      return received;
    });
    expect(captured).toEqual({ stateKey: 'cellTypeSearchFilter', value: 'sst' });
  });

  test('Escape clears the input + state', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(async () => {
      const input = document.createElement('input');
      input.id = 'celltype-search';
      document.body.appendChild(input);
      const C = window.SpatialViewerCore;
      const app = C.createApp({ adapter: {} });
      app.use(C.features.cellTypeSearch);
      app.start();
      input.value = 'foo';
      input.oninput({ target: input });
      // Now press escape — handler clears.
      input.onkeydown({ key: 'Escape' });
      const state = app.state.cellTypeSearchFilter;
      const inputVal = input.value;
      input.remove();
      app.destroy();
      return { state, inputVal };
    });
    expect(out).toEqual({ state: '', inputVal: '' });
  });

  test('setting state externally syncs the DOM input on next render', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(async () => {
      const input = document.createElement('input');
      input.id = 'celltype-search';
      document.body.appendChild(input);
      const C = window.SpatialViewerCore;
      const app = C.createApp({ adapter: {} });
      app.use(C.features.cellTypeSearch);
      app.start();
      input.value = 'foo';
      input.oninput({ target: input });
      // Now externally clear via setState (e.g., solo feature does this).
      app.setState({ cellTypeSearchFilter: '' });
      await Promise.resolve();
      const after = input.value;
      input.remove();
      app.destroy();
      return after;
    });
    expect(out).toBe('');
  });

  test('setting state to same value does NOT re-call adapter', async ({ page }) => {
    await gotoAndWait(page);
    const callCount = await page.evaluate(() => {
      const input = document.createElement('input');
      input.id = 'celltype-search';
      document.body.appendChild(input);
      let calls = 0;
      const adapter = { onCellTypeSearchChange: () => calls++ };
      const C = window.SpatialViewerCore;
      const app = C.createApp({ adapter });
      app.use(C.features.cellTypeSearch);
      app.start();
      input.value = 'pvalb';
      input.oninput({ target: input });
      input.value = 'pvalb';   // same value
      input.oninput({ target: input });
      input.remove();
      app.destroy();
      return calls;
    });
    expect(callCount).toBe(1);
  });
});

test.describe('geneSearch feature', () => {
  test('uses #gene-search and state.geneSearchFilter', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const input = document.createElement('input');
      input.id = 'gene-search';
      document.body.appendChild(input);
      const log = [];
      const adapter = { onGeneSearchChange: (v) => log.push(v) };
      const C = window.SpatialViewerCore;
      const app = C.createApp({ adapter });
      app.use(C.features.geneSearch);
      app.start();
      input.value = 'GAD1';
      input.oninput({ target: input });
      const state = app.state.geneSearchFilter;
      input.remove();
      app.destroy();
      return { state, log };
    });
    expect(out.state).toBe('gad1');
    expect(out.log).toEqual(['gad1']);
  });

  test('cell-type and gene search coexist independently', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const ct = document.createElement('input'); ct.id = 'celltype-search'; document.body.appendChild(ct);
      const gn = document.createElement('input'); gn.id = 'gene-search';     document.body.appendChild(gn);
      const C = window.SpatialViewerCore;
      const app = C.createApp({ adapter: {} });
      app.use(C.features.cellTypeSearch).use(C.features.geneSearch);
      app.start();
      ct.value = 'pvalb'; ct.oninput({ target: ct });
      gn.value = 'gad1';  gn.oninput({ target: gn });
      const state = { ct: app.state.cellTypeSearchFilter, gn: app.state.geneSearchFilter };
      ct.remove(); gn.remove();
      app.destroy();
      return state;
    });
    expect(out).toEqual({ ct: 'pvalb', gn: 'gad1' });
  });
});

test.describe('makeSearchFeature factory', () => {
  test('produces a feature with custom inputId + stateKey + adapterMethod', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const input = document.createElement('input');
      input.id = 'my-custom-search';
      document.body.appendChild(input);
      const log = [];
      const adapter = { handleMyFilter: (v) => log.push(v) };
      const C = window.SpatialViewerCore;
      const feat = C.makeSearchFeature({
        inputId: 'my-custom-search',
        stateKey: 'myFilter',
        adapterMethod: 'handleMyFilter',
      });
      const app = C.createApp({ adapter });
      app.use(feat);
      app.start();
      input.value = 'foo';
      input.oninput({ target: input });
      const state = app.state.myFilter;
      input.remove();
      app.destroy();
      return { state, log };
    });
    expect(out).toEqual({ state: 'foo', log: ['foo'] });
  });
});
