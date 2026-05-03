# Changelog

All notable changes to `spatial-viewer-core` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to a loose semver: bumps are tagged on `main` and
downstream viewers pin via the synced `core/VERSION` file.

## [Unreleased]

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
