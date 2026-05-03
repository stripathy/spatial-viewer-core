/**
 * Minimal example viewer.
 *
 * The smallest reasonable viewer.js:
 *   - Loads a single hard-coded sample (`demo`)
 *   - One categorical color mode (subclass) + one continuous (depth)
 *   - No boundaries, no transcripts, no QC
 *
 * If you're starting a new viewer, copy this directory, swap in your
 * data, and start adding the bits you need (boundaries, transcripts,
 * QC filter, multi-clustering tooltip, etc.). The RSC and SCZ viewers
 * in the GitHub org are the worked-example endpoints.
 */
const {
  normalizeHex,
  drawDimLayer, drawScatterLayer,
  hitTestCell,
  drawScaleBar,
  renderTooltip,
  createApp, features,
} = window.SpatialViewerCore;

// ── State (module-scope; everything that's not feature-owned) ──────────
let sampleData = null;
let indexData = null;
let colorMode = 'subclass';
let activeTypes = new Set();
let pointSize = 3;
let pointOpacity = 0.85;
let baseScale = 1;
let viewX = 0, viewY = 0, viewScale = 1;
let isDragging = false;
let dragStartX, dragStartY, dragViewX, dragViewY;

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let logicalWidth = 0, logicalHeight = 0;

// Continuous-mode (depth) palette: simple viridis-like. Real viewers
// would import this from a shared LUT module.
const DEPTH_LUT = [];
for (let i = 0; i <= 256; i++) {
  const t = i / 256;
  const r = Math.round(68 + t * (253 - 68));
  const g = Math.round(1 + t * (231 - 1));
  const b = Math.round(84 + t * (37 - 84));
  DEPTH_LUT.push(`rgb(${r},${g},${b})`);
}

// ── App + adapter ──────────────────────────────────────────────────────
const adapter = createDemoAdapter({
  getSampleData: () => sampleData,
  getIndexData: () => indexData,
  getColorMode: () => colorMode,
  getActiveTypes: () => activeTypes,
  setActiveTypes: (s) => { activeTypes = s; },
  precomputeColors: () => precomputeColors(),
  buildCellTypeFilter: () => buildCellTypeFilter(),
  buildGeneList: () => {},        // no-op (no transcripts)
  updateLegend: () => updateLegend(),
  render: () => render(),
});
const app = createApp({
  adapter,
  initialState: {
    showDeselectedCells: true,
    cellTypeSearchFilter: '',
    soloMode: false,
    soloType: null,
    colorMode: 'subclass',
  },
});
app.use(features.showDeselected)
   .use(features.cellTypeSearch)
   .use(features.solo)
   .use(features.colorPicker);
app.on('render', () => render());

// ── Init / sample loading ──────────────────────────────────────────────
async function init() {
  indexData = await fetch('data/index.json').then(r => r.json());
  buildSampleList();
  await loadSample(indexData.samples[0].sample_id);
  app.start();
  resizeCanvas();
  fitView();
  render();
}

function buildSampleList() {
  const el = document.getElementById('sample-list');
  el.innerHTML = '';
  indexData.samples.forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'sample-btn active';
    btn.textContent = s.sample_id;
    btn.dataset.sample = s.sample_id;
    btn.onclick = () => loadSample(s.sample_id);
    el.appendChild(btn);
  });
}

async function loadSample(sampleId) {
  sampleData = await fetch(`data/${sampleId}.json`).then(r => r.json());
  activeTypes = new Set(sampleData.subclass_cats);
  precomputeColors();
  buildCellTypeFilter();
  resizeCanvas();
  fitView();
  render();
}

// ── Color precompute ───────────────────────────────────────────────────
function precomputeColors() {
  if (!sampleData) return;
  const n = sampleData.n_cells;
  sampleData._colors = new Array(n);
  if (colorMode === 'depth') {
    const arr = sampleData.predicted_norm_depth;
    for (let i = 0; i < n; i++) {
      const d = Math.max(0, Math.min(1, arr[i]));
      sampleData._colors[i] = DEPTH_LUT[Math.round(d * 256)];
    }
    return;
  }
  // Categorical (subclass) mode.
  const palette = indexData.subclass_colors || {};
  const cats = sampleData.subclass_cats;
  const cc = cats.map(c => palette[c] || '#666');
  const idx = sampleData.subclass;
  for (let i = 0; i < n; i++) sampleData._colors[i] = cc[idx[i]];
}

// ── Sidebar: cell-type filter list ─────────────────────────────────────
function buildCellTypeFilter() {
  const el = document.getElementById('celltype-filter');
  el.innerHTML = '';
  if (!sampleData) return;
  if (colorMode === 'depth') {
    el.innerHTML = '<div style="font-size:11px;color:#888;">'
      + 'Continuous color mode — no per-category filter.</div>';
    return;
  }
  const cats = sampleData.subclass_cats;
  const indices = sampleData.subclass;
  const counts = new Array(cats.length).fill(0);
  for (let i = 0; i < indices.length; i++) counts[indices[i]]++;
  const palette = indexData.subclass_colors || {};
  const q = (app.state.cellTypeSearchFilter || '').toLowerCase();
  const sorted = cats.map((c, i) => ({ name: c, count: counts[i] }))
                     .sort((a, b) => a.name.localeCompare(b.name));
  const visible = q ? sorted.filter(({ name }) => name.toLowerCase().includes(q)) : sorted;

  if (app.state.soloMode && !app.state.soloType) {
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:11px;color:#e94560;padding:4px 6px;'
      + 'border:1px dashed #e94560;border-radius:4px;margin-bottom:6px;';
    hint.textContent = 'Solo mode on — click a type to show only that one.';
    el.appendChild(hint);
  }

  visible.forEach(({ name, count }) => {
    const row = document.createElement('div');
    const isSoloTarget = app.state.soloMode && app.state.soloType === name;
    row.className = 'ct-row'
      + (activeTypes.has(name) ? '' : ' dimmed')
      + (isSoloTarget ? ' solo-target' : '');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = activeTypes.has(name);
    cb.onchange = () => {
      if (app.state.soloMode) { app.enterSolo(name); return; }
      if (cb.checked) activeTypes.add(name); else activeTypes.delete(name);
      row.classList.toggle('dimmed', !cb.checked);
      render();
    };
    const sw = document.createElement('input');
    sw.type = 'color';
    sw.className = 'ct-swatch';
    sw.value = normalizeHex(palette[name] || '#666666');
    sw.setAttribute('data-color-celltype', name);
    sw.setAttribute('data-color-mode', 'subclass');
    sw.onclick = (e) => e.stopPropagation();
    const lbl = document.createElement('span'); lbl.className = 'ct-label'; lbl.textContent = name;
    const cnt = document.createElement('span'); cnt.className = 'ct-count'; cnt.textContent = count.toLocaleString();
    row.append(cb, sw, lbl, cnt);
    row.onclick = (e) => {
      if (e.target === cb || e.target === sw) return;
      if (app.state.soloMode) { app.enterSolo(name); return; }
      cb.checked = !cb.checked; cb.onchange();
    };
    el.appendChild(row);
  });
}

// ── Legend overlay (top-right of canvas) ───────────────────────────────
function updateLegend() {
  const el = document.getElementById('legend-overlay');
  if (!sampleData || colorMode === 'depth') { el.style.display = 'none'; return; }
  if (activeTypes.size > 10) { el.style.display = 'none'; return; }
  el.style.display = '';
  const palette = indexData.subclass_colors || {};
  const sorted = [...activeTypes].sort();
  let html = '<div class="leg-title">Cell types</div>';
  for (const name of sorted) {
    const swatch = normalizeHex(palette[name] || '#666666');
    html += `<div class="leg-row"><span class="leg-swatch" style="background:${swatch}"></span><span>${name}</span></div>`;
  }
  el.innerHTML = html;
}

// ── View / canvas setup ────────────────────────────────────────────────
function fitView() {
  if (!sampleData) return;
  const w = logicalWidth, h = logicalHeight - 30;
  const dx = sampleData.x_range[1] - sampleData.x_range[0];
  const dy = sampleData.y_range[1] - sampleData.y_range[0];
  viewScale = Math.min(w / dx, h / dy) * 0.9;
  baseScale = viewScale;
  viewX = (w - dx * viewScale) / 2 - sampleData.x_range[0] * viewScale;
  viewY = (h - dy * viewScale) / 2 - sampleData.y_range[0] * viewScale;
}

function resizeCanvas() {
  const wrap = document.getElementById('canvas-wrap');
  const dpr = window.devicePixelRatio || 1;
  logicalWidth = wrap.clientWidth;
  logicalHeight = wrap.clientHeight;
  canvas.width = logicalWidth * dpr;
  canvas.height = logicalHeight * dpr;
  canvas.style.width = logicalWidth + 'px';
  canvas.style.height = logicalHeight + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ── Render ─────────────────────────────────────────────────────────────
function render() {
  if (!sampleData) return;
  const w = logicalWidth, h = logicalHeight;
  ctx.fillStyle = '#0d0d1a';
  ctx.fillRect(0, 0, w, h);

  const n = sampleData.n_cells;
  const x = sampleData.x, y = sampleData.y;
  const colors = sampleData._colors;

  // Build the per-cell `passes` mask. Continuous mode: every cell passes.
  const passes = new Uint8Array(n);
  if (colorMode === 'depth') {
    passes.fill(1);
  } else {
    const cats = sampleData.subclass_cats;
    const indices = sampleData.subclass;
    const activeIdxSet = new Set();
    cats.forEach((c, i) => { if (activeTypes.has(c)) activeIdxSet.add(i); });
    for (let i = 0; i < n; i++) {
      if (activeIdxSet.has(indices[i])) passes[i] = 1;
    }
  }

  const zoomRatio = baseScale > 0 ? viewScale / baseScale : 1;
  const r = pointSize * Math.max(1, Math.sqrt(zoomRatio));
  const baseOpts = { x, y, n, viewScale, viewX, viewY, w, h };

  // Dim deselected cells (only meaningful in categorical modes).
  let dimShown = 0;
  if (app.state.showDeselectedCells && colorMode !== 'depth') {
    dimShown = drawDimLayer(ctx, {
      ...baseOpts, passes, useBoundaries: false, r,
    }).shown;
  }

  // Active cells.
  const { shown } = drawScatterLayer(ctx, {
    ...baseOpts, colors, passes, r, alpha: pointOpacity,
  });

  drawScaleBar(ctx, { viewScale, logicalWidth, logicalHeight });

  document.getElementById('status-left').textContent = sampleData.sample_id;
  let status = `Zoom: ${(viewScale / baseScale).toFixed(1)}× · ${shown.toLocaleString()} cells`;
  if (dimShown > 0) status += ` (+ ${dimShown.toLocaleString()} dimmed)`;
  document.getElementById('status-right').textContent = status;
  updateLegend();
}

// ── Hover ──────────────────────────────────────────────────────────────
let hoverTimeout;
function handleHover(e) {
  if (!sampleData || isDragging) return;
  clearTimeout(hoverTimeout);
  hoverTimeout = setTimeout(() => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const tooltip = document.getElementById('tooltip');
    const sidebarWidth = document.getElementById('sidebar').offsetWidth;
    const x = sampleData.x, y = sampleData.y, n = sampleData.n_cells;

    // Build hover masks (mirrors render()'s passes, plus isDeselected for badge).
    const passesHover = new Uint8Array(n);
    const isDeselected = new Uint8Array(n);
    if (colorMode === 'depth') {
      passesHover.fill(1);
    } else {
      const cats = sampleData.subclass_cats;
      const indices = sampleData.subclass;
      const activeIdxSet = new Set();
      cats.forEach((c, i) => { if (activeTypes.has(c)) activeIdxSet.add(i); });
      for (let i = 0; i < n; i++) {
        if (activeIdxSet.has(indices[i])) {
          passesHover[i] = 1;
        } else if (app.state.showDeselectedCells) {
          passesHover[i] = 1;
          isDeselected[i] = 1;
        }
      }
    }

    const cellHit = hitTestCell({
      mx, my, x, y, n, passes: passesHover, isDeselected,
      viewScale, viewX, viewY,
      useBoundary: false, pointSize,
    });

    if (cellHit) {
      const fields = adapter.getCellTooltip(cellHit.idx, cellHit);
      const ev = { kind: 'cell', idx: cellHit.idx, hit: cellHit, fields };
      app.emit('tooltipReady', ev);
      tooltip.innerHTML = renderTooltip(ev.fields);
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX - sidebarWidth + 12) + 'px';
      tooltip.style.top = (e.clientY - 60) + 'px';
    } else {
      tooltip.style.display = 'none';
    }
  }, 50);
}

// ── DOM events ─────────────────────────────────────────────────────────
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    colorMode = btn.dataset.mode;
    app.setState({ colorMode });
    if (sampleData && colorMode !== 'depth') {
      activeTypes = new Set(sampleData.subclass_cats);
    }
    app.setState({ cellTypeSearchFilter: '', soloMode: false, soloType: null });
    precomputeColors();
    buildCellTypeFilter();
    render();
  };
});
document.getElementById('point-size').oninput = (e) => {
  pointSize = parseFloat(e.target.value);
  document.getElementById('size-val').textContent = pointSize;
  render();
};
document.getElementById('point-opacity').oninput = (e) => {
  pointOpacity = parseFloat(e.target.value);
  document.getElementById('opacity-val').textContent = pointOpacity;
  render();
};

canvas.addEventListener('mousedown', (e) => {
  isDragging = true;
  dragStartX = e.clientX; dragStartY = e.clientY;
  dragViewX = viewX; dragViewY = viewY;
  canvas.style.cursor = 'grabbing';
});
window.addEventListener('mousemove', (e) => {
  if (isDragging) {
    viewX = dragViewX + (e.clientX - dragStartX);
    viewY = dragViewY + (e.clientY - dragStartY);
    render();
  } else {
    handleHover(e);
  }
});
window.addEventListener('mouseup', () => { isDragging = false; canvas.style.cursor = 'crosshair'; });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  viewX = mx - (mx - viewX) * factor;
  viewY = my - (my - viewY) * factor;
  viewScale *= factor;
  render();
}, { passive: false });
canvas.addEventListener('dblclick', () => { fitView(); render(); });
window.addEventListener('resize', () => { resizeCanvas(); render(); });

// ── Start ──────────────────────────────────────────────────────────────
init();
