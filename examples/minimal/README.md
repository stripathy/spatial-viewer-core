# Minimal example viewer

A 200-cell synthetic dataset that exercises the smallest reasonable
subset of `spatial-viewer-core`:

- One sample, one categorical color mode (subclass), one continuous
  color mode (depth)
- No boundaries, no transcripts, no QC handling
- All four interaction features wired in (search, solo, color picker,
  show-deselected) plus the declarative tooltip

Use this as the starting point when porting your own dataset. Copy the
directory, swap in your data, and start adding the bits you need.

## Run it

```bash
# From the repo root
python3 -m http.server 8000
# Then open http://localhost:8000/examples/minimal/
```

The example loads `core/*.js` from `../../src/` directly (no sync step
needed for the example itself). In a real viewer, you'd `make sync-core`
to copy `src/` into `output/viewer/core/` and load from there.

## File layout

```
examples/minimal/
  index.html         # DOM scaffold + script load order
  style.css          # Dark theme; ~100 lines, deliberately stripped
  viewer.js          # The orchestration; ~250 lines
  data-adapter.js    # Study-specific data shape (~100 lines)
  data/
    index.json       # Lists the one sample + color palette
    demo.json        # Per-sample data: x, y, subclass, depth, counts
  README.md          # This file
```

The `data/` files are the only thing you need to regenerate when
swapping in your own data — see [`docs/data-format.md`](../../docs/data-format.md)
for the schema.

## What to change for your data

### Step 1: Generate your data files

Produce `data/index.json` + `data/<sample_id>.json` matching the schema
in [`docs/data-format.md`](../../docs/data-format.md). The smallest
viable per-sample JSON is:

```json
{
  "n_cells": 12345,
  "x": [...], "y": [...],
  "x_range": [0, 5000], "y_range": [0, 4000],
  "subclass_cats": ["TypeA", "TypeB", ...],
  "subclass": [0, 1, 1, 0, ...]
}
```

A reference pipeline for converting AnnData → these JSONs is planned
for Tier 4b — for now, see `RSC_Xenium/code/pipeline/` and
`SCZ_Xenium/code/pipeline/` for production examples.

### Step 2: Update the adapter

Most porting work happens in [`data-adapter.js`](data-adapter.js). The
adapter is the only file that needs to know your data's specific shape:

- **Multi-clustering data** (multiple cluster axes per cell, e.g., RSC):
  rewrite `getCats`, `getIndices`, `getCellTypeName` to dispatch on the
  current `colorMode`. See [RSC's adapter](https://github.com/stripathy/RSC_Xenium/blob/main/output/viewer/rsc-data.js)
  for the pattern.
- **More tooltip fields** (depth, counts, QC details): extend
  `getCellTooltip(idx)` to emit additional rows. See
  [`docs/adapter-contract.md`](../../docs/adapter-contract.md) for row
  types (plain / swatch / color / hint / raw).
- **Extra color modes** (counts, layer, etc.): add buttons to
  `index.html`, extend the mode-switch handler in `viewer.js`, and add
  a precompute branch in `precomputeColors()`.

### Step 3: Add features as you need them

Today the example uses 4 of the 5 core features. Things you might add:

- **Boundaries / nucleus outlines** — produce
  `data/boundaries/<sample>.json` per the format spec, then in
  `viewer.js` switch from `drawScatterLayer` to `drawBoundaryLayer`
  when `zoomRatio >= BOUNDARY_ZOOM_THRESHOLD` and boundaries are
  loaded. See SCZ or RSC's `loadSample` and render functions.
- **Transcript overlay** — produce `data/transcripts/<sample>/`
  files, wire in `geneSearch` feature, add a gene-list sidebar
  element, hook up `drawTranscriptOverlay` in render.
- **QC filter** — store per-cell QC status in your sample JSON, pass
  `qcMask` to render primitives. (A dedicated `qc-filter` feature is
  planned for Tier 3d.)

## See also

- [`docs/data-format.md`](../../docs/data-format.md) — JSON schemas
- [`docs/adapter-contract.md`](../../docs/adapter-contract.md) — every adapter method
- [RSC viewer](https://github.com/stripathy/RSC_Xenium/tree/main/output/viewer) — full-featured reference
- [SCZ viewer](https://github.com/stripathy/SCZ_Xenium/tree/main/output/viewer) — different shape (flat clusterings + layer overlay + QC)
