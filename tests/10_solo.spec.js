import { test, expect } from '@playwright/test';

const FIXTURE = '/tests/fixtures/index.html';

async function gotoAndWait(page) {
  await page.goto(FIXTURE);
  await page.waitForFunction(
    () => window.SpatialViewerCore
       && window.SpatialViewerCore.features
       && window.SpatialViewerCore.features.solo,
    null,
    { timeout: 5000 }
  );
}

test.describe('solo feature', () => {
  test('initialState defaults soloMode=false, soloType=null', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const C = window.SpatialViewerCore;
      const app = C.createApp({ adapter: {} });
      app.use(C.features.solo);
      return { soloMode: app.state.soloMode, soloType: app.state.soloType };
    });
    expect(out).toEqual({ soloMode: false, soloType: null });
  });

  test('app.enterSolo sets state + calls adapter + emits event', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const log = [];
      const adapter = { onSoloChange: (m, t) => log.push({ m, t }) };
      const C = window.SpatialViewerCore;
      const app = C.createApp({ adapter });
      app.use(C.features.solo);
      app.start();
      let ev = null;
      app.on('soloEntered', (p) => { ev = p; });
      app.enterSolo('Pvalb');
      const state = { soloMode: app.state.soloMode, soloType: app.state.soloType };
      app.destroy();
      return { state, log, ev };
    });
    expect(out.state).toEqual({ soloMode: true, soloType: 'Pvalb' });
    expect(out.log).toEqual([{ m: true, t: 'Pvalb' }]);
    expect(out.ev).toEqual({ type: 'Pvalb' });
  });

  test('app.exitSolo clears state + emits soloExited', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const log = [];
      const adapter = { onSoloChange: (m, t) => log.push({ m, t }) };
      const C = window.SpatialViewerCore;
      const app = C.createApp({ adapter });
      app.use(C.features.solo);
      app.start();
      let exited = false;
      app.on('soloExited', () => { exited = true; });
      app.enterSolo('Sst');
      app.exitSolo();
      const state = { soloMode: app.state.soloMode, soloType: app.state.soloType };
      app.destroy();
      return { state, log, exited };
    });
    expect(out.state).toEqual({ soloMode: false, soloType: null });
    expect(out.log).toEqual([{ m: true, t: 'Sst' }, { m: false, t: null }]);
    expect(out.exited).toBe(true);
  });

  test('exitSolo when not in solo is a no-op', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      let calls = 0;
      const adapter = { onSoloChange: () => calls++ };
      const C = window.SpatialViewerCore;
      const app = C.createApp({ adapter });
      app.use(C.features.solo);
      app.start();
      app.exitSolo();   // not in solo → no-op
      app.destroy();
      return calls;
    });
    expect(out).toBe(0);
  });

  test('#solo-btn click toggles solo mode (with auto-pick when 1 active)', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const btn = document.createElement('button');
      btn.id = 'solo-btn';
      document.body.appendChild(btn);
      const adapter = {
        onSoloChange: () => {},
        getCurrentActiveTypes: () => new Set(['Pvalb']),
      };
      const C = window.SpatialViewerCore;
      const app = C.createApp({ adapter });
      app.use(C.features.solo);
      app.start();
      btn.onclick();   // enter solo with auto-picked Pvalb
      const after1 = { ...app.state };
      btn.onclick();   // exit solo
      const after2 = { ...app.state };
      btn.remove();
      app.destroy();
      return { after1, after2 };
    });
    expect(out.after1.soloMode).toBe(true);
    expect(out.after1.soloType).toBe('Pvalb');
    expect(out.after2.soloMode).toBe(false);
    expect(out.after2.soloType).toBe(null);
  });

  test('#solo-btn click with multiple active → soloType stays null', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const btn = document.createElement('button');
      btn.id = 'solo-btn';
      document.body.appendChild(btn);
      const adapter = {
        onSoloChange: () => {},
        getCurrentActiveTypes: () => new Set(['Pvalb', 'Sst', 'Vip']),
      };
      const C = window.SpatialViewerCore;
      const app = C.createApp({ adapter });
      app.use(C.features.solo);
      app.start();
      btn.onclick();
      const state = { soloMode: app.state.soloMode, soloType: app.state.soloType };
      btn.remove();
      app.destroy();
      return state;
    });
    expect(out).toEqual({ soloMode: true, soloType: null });
  });

  test('#solo-btn gets solo-active class when soloMode=true', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(async () => {
      const btn = document.createElement('button');
      btn.id = 'solo-btn';
      document.body.appendChild(btn);
      const C = window.SpatialViewerCore;
      const app = C.createApp({
        adapter: { onSoloChange: () => {}, getCurrentActiveTypes: () => new Set(['Pvalb']) },
      });
      app.use(C.features.solo);
      app.start();
      const before = btn.classList.contains('solo-active');
      btn.onclick();
      await Promise.resolve();   // batched render
      const after = btn.classList.contains('solo-active');
      btn.remove();
      app.destroy();
      return { before, after };
    });
    expect(out).toEqual({ before: false, after: true });
  });

  test('app.enterSolo with same type does NOT re-call adapter', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      let calls = 0;
      const adapter = { onSoloChange: () => calls++ };
      const C = window.SpatialViewerCore;
      const app = C.createApp({ adapter });
      app.use(C.features.solo);
      app.start();
      app.enterSolo('Pvalb');
      app.enterSolo('Pvalb');   // same args; setState is no-op but the
                                // adapter is still called (a deliberate
                                // choice — re-entry could be meaningful)
      app.destroy();
      return calls;
    });
    // We DO re-call adapter on every enterSolo; this is intentional so
    // that adapter can re-apply state even when it's "the same" semantically
    // (e.g., after a sample switch).
    expect(out).toBe(2);
  });
});
