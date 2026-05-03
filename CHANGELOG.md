# Changelog

All notable changes to `spatial-viewer-core` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to a loose semver: bumps are tagged on `main` and
downstream viewers pin via the synced `core/VERSION` file.

## [Unreleased]

## [0.3.0] — 2026-05-02 (Tier 3c — interaction features + tooltip framework)

App framework + 5 features + declarative tooltip rendering. Each feature
is a self-contained module that registers against an `App` object;
viewers ship a small adapter (factory-built plain object) that handles
study-specific data shape.

### Added
- `src/70-app.js` — `createApp({ adapter, initialState? })` returning a
  plain object with `state`, `on/off/emit`, `setState/toggle` (microtask-
  batched render emission), `use(feature)`, `start/destroy`.
- `src/60-tooltip.js` — `renderTooltip({ title, badge?, sections, position? })`
  walks a declarative field-list and produces HTML. Row types:
  plain, swatch, color, hint, raw escape-hatch.
- `src/60-features/show-deselected.js` — owns `state.showDeselectedCells`,
  the 'x' shortcut, the `#show-deselected-toggle` checkbox, and the
  tooltipReady-decorator that adds the "deselected" badge.
- `src/60-features/search.js` — exports `cellTypeSearch` + `geneSearch`
  via a `makeSearchFeature({ inputId, stateKey, adapterMethod })` factory.
- `src/60-features/solo.js` — owns `state.{soloMode, soloType}`, wires
  `#solo-btn`, exposes `app.enterSolo(type)` / `app.exitSolo()`.
- `src/60-features/color-picker.js` — `app.setCellTypeColor` /
  `app.setGeneColor` plus event-delegation wiring on `#celltype-filter`
  and `#legend-overlay` for swatches with `data-color-celltype` /
  `data-color-gene` / `data-color-mode`.
- 69 new Playwright tests (123 total: 18 app + 17 tooltip + 9 show-
  deselected + 9 search + 8 solo + 8 color-picker).

### Adapter contract (downstream viewers must provide)
The adapter is a plain object with these methods (used by features):
- `isCellDeselected(idx)` — show-deselected
- `onCellTypeSearchChange(value)`, `onGeneSearchChange(value)` — search
- `onSoloChange(soloMode, soloType)`, `getCurrentActiveTypes()` — solo
- `applyCellTypeColor(mode, name, color)`, `applyGeneColor(gene, color)` — color-picker

Plus tooltip builders:
- `getCellTooltip(idx, ctx)` → field-list
- `getMoleculeTooltip(hit)` → field-list

## [0.2.0] — 2026-05-02 (Tier 3b — render + hover primitives)

Five rendering primitives + two hit-test functions extracted from
`render()` and `handleHover()` in both viewers.

### Added
- `src/30-render-primitives.js`:
  - `drawDimLayer(ctx, opts)` — dim deselected cells, branches on
    `useBoundaries` (polygon stroke at high zoom, scatter at low).
  - `drawBoundaryLayer(ctx, opts)` — fill polygons + point fallback
    + optional nucleus stroke pass; bucketed by color.
  - `drawNucleusOnlyLayer(ctx, opts)` — centroid dots + nucleus
    outlines (third render branch).
  - `drawScatterLayer(ctx, opts)` — fastest path; pure point cloud.
  - `drawTranscriptOverlay(ctx, opts)` — transcript-molecule dots.
- `src/40-hover.js`:
  - `hitTestMolecule(opts)` — closest molecule in data coords, with
    frustum cull. Returns `{ gene, idx, distSq } | null`.
  - `hitTestCell(opts)` — point-in-polygon (boundary mode) or
    nearest-centroid (centroid mode). Returns
    `{ idx, distSq, isDeselected } | null`.
- 25 new Playwright tests for the primitives + hit tests (offscreen
  canvas + per-pixel checks).

### Changed
- All primitives are pure w.r.t. canvas state: each wraps its work in
  `ctx.save()` / `ctx.restore()` and resets `globalAlpha` so they
  compose without leaking state.
- All primitives accept an optional `qcMask: Uint8Array` so studies that
  have a "hide QC-fail" toggle (currently SCZ) can plug their gating in
  without forking the primitive.

## [0.1.0] — 2026-05-02 (Tier 3a — pure utilities)

Initial extraction from `RSC_Xenium` and `SCZ_Xenium` viewers.

### Added
- `src/10-utils.js` — `normalizeHex`, `safeIntCmp`
- `src/20-boundary.js` — `decodeBoundaryJson`, `buildCellToBoundaryMap`
- `src/50-scale-bar.js` — `drawScaleBar(ctx, opts)` (param-refactored)
- Playwright tests for utils, boundary, and scale-bar (29 tests, all green)

### Changed
- `buildCellToBoundaryMap` is now pure: it takes `(bd, sample, opts?)` and
  **returns** the map instead of mutating a global `cellToBoundaryIdx`.
- `drawScaleBar` is now param-refactored: it takes
  `(ctx, { viewScale, logicalWidth, logicalHeight, padding?, statusBarH?, targetPx? })`
  instead of reading `viewScale`, `logicalWidth`, `logicalHeight` as bare globals.
- `_normalizeHex` was renamed to `normalizeHex` (underscore prefix dropped).

## [0.0.1] — 2026-05-02 (Setup)

Repository scaffolded. README, LICENSE, package.json, playwright config,
GitHub Actions workflow. No code yet.
