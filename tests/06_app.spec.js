import { test, expect } from '@playwright/test';

const FIXTURE = '/tests/fixtures/index.html';

async function gotoAndWait(page) {
  await page.goto(FIXTURE);
  await page.waitForFunction(
    () => window.SpatialViewerCore && typeof window.SpatialViewerCore.createApp === 'function',
    null,
    { timeout: 5000 }
  );
}

test.describe('createApp — basic shape', () => {
  test('exposes adapter, state, features, plus core methods', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const adapter = { name: 'test' };
      const app = window.SpatialViewerCore.createApp({ adapter, initialState: { foo: 1 } });
      return {
        adapterName: app.adapter.name,
        stateFoo: app.state.foo,
        featuresIsArray: Array.isArray(app.features),
        methods: ['on','off','emit','setState','toggle','requestRender','use','start','destroy']
          .every(m => typeof app[m] === 'function'),
      };
    });
    expect(out.adapterName).toBe('test');
    expect(out.stateFoo).toBe(1);
    expect(out.featuresIsArray).toBe(true);
    expect(out.methods).toBe(true);
  });

  test('initialState defaults to empty', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const app = window.SpatialViewerCore.createApp({ adapter: {} });
      return Object.keys(app.state).length;
    });
    expect(out).toBe(0);
  });
});

test.describe('events', () => {
  test('emit fires every listener with the payload', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const app = window.SpatialViewerCore.createApp({ adapter: {} });
      const log = [];
      app.on('hello', (p) => log.push('a:' + p));
      app.on('hello', (p) => log.push('b:' + p));
      app.emit('hello', 'world');
      return log;
    });
    expect(out).toEqual(['a:world', 'b:world']);
  });

  test('off removes a listener', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const app = window.SpatialViewerCore.createApp({ adapter: {} });
      const log = [];
      const fn = () => log.push('hit');
      app.on('e', fn);
      app.off('e', fn);
      app.emit('e');
      return log;
    });
    expect(out).toEqual([]);
  });

  test('off during dispatch is safe (snapshot iteration)', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const app = window.SpatialViewerCore.createApp({ adapter: {} });
      const log = [];
      const a = () => { log.push('a'); app.off('e', b); };
      const b = () => { log.push('b'); };
      app.on('e', a);
      app.on('e', b);
      app.emit('e');  // both run, even though a removes b
      app.emit('e');  // now only a runs
      return log;
    });
    expect(out).toEqual(['a', 'b', 'a']);
  });

  test('emit with no listeners is a no-op', async ({ page }) => {
    await gotoAndWait(page);
    const ok = await page.evaluate(() => {
      const app = window.SpatialViewerCore.createApp({ adapter: {} });
      app.emit('nobody-home', { x: 1 });
      return true;
    });
    expect(ok).toBe(true);
  });
});

test.describe('setState + render batching', () => {
  test('setState merges into state', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const app = window.SpatialViewerCore.createApp({
        adapter: {}, initialState: { a: 1, b: 2 },
      });
      app.setState({ b: 99, c: 3 });
      return { ...app.state };
    });
    expect(out).toEqual({ a: 1, b: 99, c: 3 });
  });

  test('toggle flips a boolean', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const app = window.SpatialViewerCore.createApp({
        adapter: {}, initialState: { flag: false },
      });
      app.toggle('flag');
      const v1 = app.state.flag;
      app.toggle('flag');
      const v2 = app.state.flag;
      return [v1, v2];
    });
    expect(out).toEqual([true, false]);
  });

  test('multiple setState calls in same tick coalesce into ONE render', async ({ page }) => {
    await gotoAndWait(page);
    const renderCount = await page.evaluate(async () => {
      const app = window.SpatialViewerCore.createApp({ adapter: {} });
      let renders = 0;
      app.on('render', () => renders++);
      app.start();              // initial render = 1
      const startCount = renders;
      app.setState({ a: 1 });
      app.setState({ b: 2 });
      app.setState({ c: 3 });
      // Wait one microtask for the batched render to fire.
      await Promise.resolve();
      return { startCount, after: renders };
    });
    expect(renderCount.startCount).toBe(1);
    expect(renderCount.after).toBe(2);  // start (1) + one batched render
  });

  test('setState before start() does NOT render', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(async () => {
      const app = window.SpatialViewerCore.createApp({ adapter: {} });
      let renders = 0;
      app.on('render', () => renders++);
      app.setState({ a: 1 });
      await Promise.resolve();
      return renders;
    });
    expect(out).toBe(0);
  });

  test('setState with no actual change does NOT trigger a render', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(async () => {
      const app = window.SpatialViewerCore.createApp({
        adapter: {}, initialState: { a: 1 },
      });
      app.start();
      let renders = 0;
      app.on('render', () => renders++);
      app.setState({ a: 1 });   // same value; should be a no-op
      await Promise.resolve();
      return renders;
    });
    expect(out).toBe(0);
  });
});

test.describe('use + features', () => {
  test('use merges initialState (without overwriting existing keys)', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const feat = {
        initialState: { showFoo: true, count: 99 },
        register() {},
      };
      const app = window.SpatialViewerCore.createApp({
        adapter: {}, initialState: { count: 5 },  // pre-existing wins
      });
      app.use(feat);
      return { showFoo: app.state.showFoo, count: app.state.count };
    });
    expect(out).toEqual({ showFoo: true, count: 5 });
  });

  test('use calls register(app)', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      let captured = null;
      const feat = { register: (app) => { captured = app; } };
      const app = window.SpatialViewerCore.createApp({ adapter: {} });
      app.use(feat);
      return captured === app;
    });
    expect(out).toBe(true);
  });

  test('use is chainable and pushes to app.features', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const f1 = { register() {} };
      const f2 = { register() {} };
      const app = window.SpatialViewerCore.createApp({ adapter: {} });
      const ret = app.use(f1).use(f2);
      return { isApp: ret === app, count: app.features.length };
    });
    expect(out).toEqual({ isApp: true, count: 2 });
  });
});

test.describe('start + lifecycle', () => {
  test('start fires mounted then render (in order, both synchronous)', async ({ page }) => {
    await gotoAndWait(page);
    const log = await page.evaluate(() => {
      const app = window.SpatialViewerCore.createApp({ adapter: {} });
      const seen = [];
      app.on('mounted', () => seen.push('mounted'));
      app.on('render', () => seen.push('render'));
      app.start();
      return seen;
    });
    expect(log).toEqual(['mounted', 'render']);
  });

  test('calling start twice is a no-op', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const app = window.SpatialViewerCore.createApp({ adapter: {} });
      let mountCount = 0;
      app.on('mounted', () => mountCount++);
      app.start();
      app.start();
      return mountCount;
    });
    expect(out).toBe(1);
  });

  test('document keydown re-emits as app.on("keydown")', async ({ page }) => {
    await gotoAndWait(page);
    const captured = await page.evaluate(() => new Promise((resolve) => {
      const app = window.SpatialViewerCore.createApp({ adapter: {} });
      app.on('keydown', (e) => resolve(e.key));
      app.start();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }));
    }));
    expect(captured).toBe('q');
  });

  test('destroy stops keydown forwarding + clears listeners', async ({ page }) => {
    await gotoAndWait(page);
    const out = await page.evaluate(() => {
      const app = window.SpatialViewerCore.createApp({ adapter: {} });
      let hits = 0;
      app.on('keydown', () => hits++);
      app.start();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
      app.destroy();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
      return hits;
    });
    expect(out).toBe(1);
  });
});
