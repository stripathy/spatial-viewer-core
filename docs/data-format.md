# Data format

This document specifies the JSON files a `spatial-viewer-core`-based
viewer reads at runtime. If you can produce these files from your data,
you can ship a viewer.

There are four file kinds:

| File | When loaded | Required? |
|---|---|---|
| `index.json` | Once at viewer start | Yes |
| `<sampleId>.json` | When user picks a sample | Yes |
| `boundaries/<sampleId>.json` | After sample load (if boundaries enabled) | No |
| `boundaries/<sampleId>_nucleus.json` | After sample load (if nucleus outlines enabled) | No |
| `transcripts/<sampleId>/gene_index.json` + per-gene files | If transcript overlay enabled | No |

All files are static — there is no server. A `python3 -m http.server`
or any CDN works.

---

## File 1: `index.json`

Loaded once at startup. Lists the samples and provides cross-sample
metadata (color palettes, etc.).

### Minimum required shape

```json
{
  "samples": [
    { "sample_id": "sample1", "n_cells": 12345 }
  ]
}
```

### Field reference

| Field | Type | Required | Notes |
|---|---|---|---|
| `samples` | `Array<SampleEntry>` | yes | Order = display order in sidebar |
| `samples[].sample_id` | `string` | yes | Filename stem; used to fetch `<sample_id>.json` |
| `samples[].n_cells` | `number` | recommended | Shown in sidebar; not load-blocking |
| `samples[].<extra>` | any | optional | Study-specific labels (e.g., `diagnosis`, `donor`) — your adapter reads these to group/style sample buttons |

### Color palettes

How palettes are stored is **a design choice** — viewers in this repo
use two different conventions; both work.

**Convention A (one palette per mode, top-level keys):** SCZ uses this.

```json
{
  "samples": [...],
  "subclass_colors": { "L2/3 IT": "#ff5e3a", "L4 IT": "#feb236", ... },
  "supertype_colors": { ... },
  "layer_colors": { "L1": "#440154", "L2/3": "#3b528b", ... }
}
```

**Convention B (nested under `cluster_colors`):** RSC uses this.

```json
{
  "samples": [...],
  "clusterings": ["frk_type", "whb_supercluster", "sea_class"],
  "cluster_colors": {
    "frk_type":         { "L2/3 IT": "#ff5e3a", "L4 IT": "#feb236", ... },
    "whb_supercluster": { ... }
  }
}
```

The choice is **adapter-local**. Your adapter resolves "the palette for
the current color mode" — core never indexes into either structure
directly.

### Other top-level fields

Anything else you put at the top level is study-specific and your
adapter is responsible for using it. RSC, for example, includes
`frk_sources` and `frk_display_order` for its Franken cluster mode;
core ignores them entirely.

---

## File 2: `<sampleId>.json`

The bulk of the data. One file per sample, fetched on demand when the
user picks a sample from the sidebar.

### Minimum required shape

```json
{
  "n_cells": 12345,
  "x": [123.4, 456.7, ...],
  "y": [78.9, 102.3, ...],
  "x_range": [0.0, 5000.0],
  "y_range": [0.0, 4000.0],
  "subclass_cats": ["Astrocyte", "L2/3 IT", "L4 IT", ...],
  "subclass":      [0, 1, 1, 2, 0, ...]
}
```

(With `colorMode = 'subclass'` as the only mode.)

### Field reference

#### Required for every sample

| Field | Type | Notes |
|---|---|---|
| `n_cells` | `number` | Length of `x`, `y`, and every `<mode>` array |
| `x` | `Array<number>` | Cell centroid X in **µm** |
| `y` | `Array<number>` | Cell centroid Y in **µm** |
| `x_range` | `[min, max]` | For `fitView()` |
| `y_range` | `[min, max]` | For `fitView()` |

#### Categorical color modes

You must provide enough to support whatever modes your adapter exposes.
For each mode (e.g., `subclass`, `supertype`, `layer`, …), provide a
**parallel pair**:

```json
{
  "subclass_cats": ["Astrocyte", "L2/3 IT", ...],   // unique label list (deduplicated)
  "subclass":      [0, 1, 1, 2, ...]                // length n_cells; integer index into _cats
}
```

The integer-index style keeps the per-sample JSON ~10x smaller than
storing the string label per cell. Required.

**Alternative shape** (the multi-clustering style RSC uses):

```json
{
  "clusterings": {
    "frk_type":          { "cats": [...], "idx": [...] },
    "whb_supercluster":  { "cats": [...], "idx": [...] }
  }
}
```

Both styles work — your adapter chooses one. Use the flat style for
simple datasets (subclass/supertype/etc.); use `clusterings` when you
have many co-existing clustering axes.

#### Continuous color modes (optional)

| Field | Type | Notes |
|---|---|---|
| `predicted_norm_depth` | `Array<number>` | Length `n_cells`; values in `[0, 1]`. Required only if you expose a "depth" color mode. |
| `transcript_counts` | `Array<number>` | Length `n_cells`. Required for a "counts" color mode. |
| `depth` | `Array<number>` | SCZ uses this name. Either is fine; just keep your adapter consistent. |

#### Cell identity / metadata (optional, surfaced in tooltips)

| Field | Type | Notes |
|---|---|---|
| `cell_ids` | `Array<string>` | Stable ID per cell (e.g., Xenium `cell_id`). Tooltip title falls back to `#<idx>` if missing. |
| `cell_area` | `Array<number>` | µm² |
| `nucleus_area` | `Array<number>` | µm² |
| `transcript_counts` | `Array<number>` | Per-cell transcript count |

#### QC / filtering (optional)

| Field | Type | Notes |
|---|---|---|
| `qc_status` | `Array<number>` | Per-cell QC fail code: `0` = pass, `>0` = fail with code-specific reason. Plug into the qc-filter feature (Tier 3d / 4) by exposing `getQcFailMask()` from your adapter. |
| `cell_qc_pass` | `Array<bool>` | Alternative: simple pass/fail boolean. Either is fine. |

#### Reference-mapping fields (RSC convention; optional)

If you have multiple reference taxonomies (e.g., WHB, SEA-AD, custom),
you can attach per-cell quality scores per mode:

| Field | Type | Notes |
|---|---|---|
| `<mode>_corr` | `Array<number>` | Correlation to the assigned reference type |
| `<mode>_margin` | `Array<number>` | Confidence margin (assignment − next-best) |
| `<ref>_hierarchy_consistent` | `Array<bool>` | Hierarchy consistency check |
| `conf_class`, `conf_subclass`, `conf_supertype` | `Array<number>` | SCZ HANN confidence scores (stored ×200 to fit `Uint8`; divide on display) |

These are **adapter-surfaced** — core doesn't know about them. Tooltip
content is built by your adapter's `getCellTooltip(idx)`.

---

## File 3: `boundaries/<sampleId>.json` and `<sampleId>_nucleus.json`

Cell-segmentation polygons (and optional nucleus polygons). Loaded
after the per-sample JSON. Required only if you want polygon rendering
when zoomed in.

### Shape

```json
{
  "n_cells": 12345,
  "verts_per_cell": 25,
  "x_offset": 2.55,
  "y_offset": 109.65,
  "x_scale": 0.2,
  "y_scale": 0.2,
  "bx": [12, 14, 16, ...],   // length n_cells * verts_per_cell
  "by": [33, 31, 30, ...]    // length n_cells * verts_per_cell
}
```

### Decoding

`bx[i] * x_scale + x_offset` gives the absolute µm X coordinate. The
core helper `decodeBoundaryJson(raw)` does this and returns Float32Arrays.

### Why this layout

- **Fixed `verts_per_cell`** — polygons are padded (or truncated) to a
  fixed vertex count. This makes JSON parsing trivial (no nested arrays)
  and lets the renderer iterate without per-cell length checks. Padded
  vertices repeat the last real vertex (no visible artifact when drawn).
- **Integer storage with offset/scale** — most segmentation polygons
  have ~5x finer resolution than the centroid grid. Store small
  integers, multiply on load. Saves 30-50% bytes vs. floats.
- **`bx` / `by` flat arrays** instead of `[[x,y], [x,y], ...]` — saves
  ~30% bytes by avoiding nested-array braces, and lets the decoder
  populate two `Float32Array`s in one pass.

### Optional: cell-to-boundary mapping

If `n_cells` in the boundary file equals `n_cells` in the sample file,
the mapping is identity (cell `i` → boundary `i`). If not (some cells
have no boundary), the boundary file may include:

| Field | Type | Notes |
|---|---|---|
| `n_with_boundary` | `number` | The actual polygon count (≤ sample's `n_cells`) |

Core's `buildCellToBoundaryMap(bd, sample)` walks both arrays in
lockstep and matches by centroid distance (5µm tolerance by default).
See [`src/20-boundary.js`](../src/20-boundary.js) for the algorithm.

### Nucleus boundaries

Same exact shape, just a separate file (`<sampleId>_nucleus.json`).
Drawn as a stroke-only outline overlay on top of the cell fill.

---

## File 4: Transcripts (optional)

Per-molecule transcript locations. Loaded lazily when the user
activates a gene from the transcript picker.

### `transcripts/<sampleId>/gene_index.json`

```json
{
  "sample_id": "sample1",
  "n_genes": 319,
  "total_transcripts": 12345678,
  "x_offset": 0.0,
  "y_offset": 0.0,
  "x_scale": 1.0,
  "y_scale": 1.0,
  "genes": [
    { "gene": "GAD1", "n": 9876, "file": "GAD1.json", "size_kb": 120.4 }
  ]
}
```

### `transcripts/<sampleId>/<gene>.json`

```json
{
  "gene": "GAD1",
  "n": 9876,
  "x": [1139, 733, ...],
  "y": [13191, 13683, ...]
}
```

`x` / `y` are integer counts; the viewer applies
`x[i] * x_scale + x_offset` from `gene_index.json` on load. Storing
ints saves ~50% over floats.

---

## Coordinate conventions

- **Units: µm.** All `x`, `y`, `x_range`, `y_range` and decoded boundary
  coordinates are in µm. The viewer's zoom + scale-bar assume this.
- **Origin: top-left of canvas.** Y increases downward (canvas
  convention, matches Xenium/MERFISH outputs in their image-pixel
  coordinate frames). If your data is in a Y-up frame, flip before
  exporting.
- **No rotation/skew.** All transforms are translation + scale only.
  Apply any rotation upstream.

## Numeric precision

- Centroid `x`/`y` arrays: `number` (JS doubles). For 100k cells × 2 ×
  8 bytes, that's 1.6 MB; cheaper precision (16-bit ints with scale)
  is fine for the viewer but adds a decode step.
- Boundary `bx`/`by`: integers with offset+scale (recommended) — saves
  bandwidth materially. The viewer always converts to `Float32Array`
  on load.
- Cluster `idx` arrays: `number` (will be coerced when used as array
  indices). 16-bit fits all real category counts; if your dataset has
  >65k unique cluster names, you have other problems.

## Validation

There is **no schema validator** today. The viewer fails-soft on missing
optional fields (e.g., no `predicted_norm_depth` → depth mode hidden by
adapter), but missing required fields will cause a JS runtime error on
sample load. When porting a new dataset, open the browser DevTools
console as a first step.

## See also

- [`adapter-contract.md`](adapter-contract.md) — how your viewer reads these files via the adapter API
- [`../examples/minimal/`](../examples/minimal/) — a 100-cell synthetic dataset matching this spec
