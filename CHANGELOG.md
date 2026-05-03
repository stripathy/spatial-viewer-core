# Changelog

All notable changes to `spatial-viewer-core` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to a loose semver: bumps are tagged on `main` and
downstream viewers pin via the synced `core/VERSION` file.

## [Unreleased]

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
