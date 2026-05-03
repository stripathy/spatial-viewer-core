import { test, expect } from '@playwright/test';

const FIXTURE = '/tests/fixtures/index.html';

async function gotoAndWait(page) {
  await page.goto(FIXTURE);
  await page.waitForFunction(
    () => window.SpatialViewerCore && typeof window.SpatialViewerCore.renderTooltip === 'function',
    null,
    { timeout: 5000 }
  );
}

async function render(page, fields) {
  return page.evaluate((f) => window.SpatialViewerCore.renderTooltip(f), fields);
}

test.describe('renderTooltip — title + badge', () => {
  test('plain title', async ({ page }) => {
    await gotoAndWait(page);
    const html = await render(page, { title: 'cell_42' });
    expect(html).toContain('class="tt-label"');
    expect(html).toContain('cell_42');
  });

  test('title + badge wraps badge in pill markup', async ({ page }) => {
    await gotoAndWait(page);
    const html = await render(page, { title: 'cell_42', badge: 'deselected' });
    expect(html).toContain('cell_42');
    expect(html).toContain('deselected');
    expect(html).toMatch(/border-radius:3px/);
  });

  test('no title, no badge → no tt-label div', async ({ page }) => {
    await gotoAndWait(page);
    const html = await render(page, { sections: [{ rows: [{ label: 'x', value: 'y' }] }] });
    expect(html).not.toContain('tt-label');
    expect(html).toContain('x: y');
  });

  test('null fields returns empty string', async ({ page }) => {
    await gotoAndWait(page);
    const html = await render(page, null);
    expect(html).toBe('');
  });
});

test.describe('renderTooltip — row types', () => {
  test('plain row "Label: value"', async ({ page }) => {
    await gotoAndWait(page);
    const html = await render(page, {
      sections: [{ rows: [{ label: 'Subclass', value: 'L2/3 IT' }] }],
    });
    expect(html).toContain('Subclass: L2/3 IT');
  });

  test('swatch row injects colored square', async ({ page }) => {
    await gotoAndWait(page);
    const html = await render(page, {
      sections: [{ rows: [{ label: 'Subclass', value: 'L4', swatch: '#ff0000' }] }],
    });
    expect(html).toContain('background:#ff0000');
    expect(html).toContain('Subclass: L4');
  });

  test('color row colors the value text', async ({ page }) => {
    await gotoAndWait(page);
    const html = await render(page, {
      sections: [{ rows: [{ label: 'Layer', value: 'L4', color: '#00ff00' }] }],
    });
    expect(html).toMatch(/color:#00ff00/);
    expect(html).toContain('font-weight:700');
  });

  test('hint adds small grey suffix', async ({ page }) => {
    await gotoAndWait(page);
    const html = await render(page, {
      sections: [{ rows: [{ label: 'Depth', value: '0.500', hint: '(0=pia, 1=WM)' }] }],
    });
    expect(html).toContain('Depth: 0.500');
    expect(html).toContain('(0=pia, 1=WM)');
    expect(html).toContain('font-size:10px');
  });

  test('raw row passes HTML through unescaped', async ({ page }) => {
    await gotoAndWait(page);
    const html = await render(page, {
      sections: [{ rows: [{ raw: true, html: '<span class="custom">hi</span>' }] }],
    });
    expect(html).toContain('<span class="custom">hi</span>');
  });
});

test.describe('renderTooltip — sections', () => {
  test('multiple sections separated by hr', async ({ page }) => {
    await gotoAndWait(page);
    const html = await render(page, {
      title: 'cell_1',
      sections: [
        { rows: [{ label: 'A', value: '1' }] },
        { rows: [{ label: 'B', value: '2' }] },
      ],
    });
    const sepCount = (html.match(/border-top:1px solid #333/g) || []).length;
    expect(sepCount).toBe(2);  // one before each section because title precedes section 0
  });

  test('section heading renders with red color', async ({ page }) => {
    await gotoAndWait(page);
    const html = await render(page, {
      sections: [{ heading: 'QC Details', rows: [{ label: 'a', value: 'b' }] }],
    });
    expect(html).toContain('QC Details');
    expect(html).toContain('color:#e94560');
  });

  test('first section without title gets no leading separator', async ({ page }) => {
    await gotoAndWait(page);
    const html = await render(page, {
      sections: [{ rows: [{ label: 'A', value: '1' }] }],
    });
    expect(html).not.toContain('border-top:1px solid #333');
  });
});

test.describe('renderTooltip — position footer', () => {
  test('position renders x= and y= with 1 decimal', async ({ page }) => {
    await gotoAndWait(page);
    const html = await render(page, {
      title: 't',
      position: { x: 123.456, y: 789.123 },
    });
    expect(html).toContain('x=123.5, y=789.1');
  });

  test('no position, no footer', async ({ page }) => {
    await gotoAndWait(page);
    const html = await render(page, { title: 't' });
    expect(html).not.toContain('x=');
  });
});

test.describe('renderTooltip — security', () => {
  test('escapes HTML in title', async ({ page }) => {
    await gotoAndWait(page);
    const html = await render(page, { title: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('escapes HTML in row values', async ({ page }) => {
    await gotoAndWait(page);
    const html = await render(page, {
      sections: [{ rows: [{ label: 'x', value: '"><img src=x>' }] }],
    });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  test('does NOT escape raw rows (caller must trust)', async ({ page }) => {
    await gotoAndWait(page);
    const html = await render(page, {
      sections: [{ rows: [{ raw: true, html: '<b>bold</b>' }] }],
    });
    expect(html).toContain('<b>bold</b>');
  });
});
