# Scripts: data converters

Two Python scripts convert real spatial-transcriptomics data into the
JSON format this viewer reads. Pick the one matching your input.

| Your input | Use |
|---|---|
| 10x Xenium output bundle (cells.parquet + cell_boundaries.parquet + …) | [`bundle_to_viewer.py`](bundle_to_viewer.py) |
| Annotated AnnData (.h5ad) — your own clustering / metadata | [`anndata_to_viewer.py`](anndata_to_viewer.py) |
| AnnData + SpatialData zarr (boundaries available) | `anndata_to_viewer.py --sdata my.zarr` |

Both produce files matching [`docs/data-format.md`](../docs/data-format.md).
Drop the resulting directory next to one of the example viewers
(or your own) and you're done.

## Install

The converters are kept dep-light — no torch, no segger runtime, no
spatialdata unless you need it.

```bash
pip install anndata pandas pyarrow h5py numpy
# Optional, only for --sdata:
pip install spatialdata
```

A pinned `requirements.txt` lives next to this README.

## Quickstart: 10x Xenium bundle → viewer

You have a directory off the instrument or off Xenium Ranger:

```
my_xenium/
    cells.parquet
    cell_boundaries.parquet
    nucleus_boundaries.parquet
    transcripts.parquet
    analysis/clustering/gene_expression_graphclust/clusters.csv
    analysis/clustering/gene_expression_kmeans_2_clusters/clusters.csv
    ... etc
```

Convert it:

```bash
python3 scripts/bundle_to_viewer.py \
    --bundle my_xenium \
    --sample-id MyExperiment \
    --output viewer_data/
```

What you get: `viewer_data/index.json` + `viewer_data/MyExperiment.json` +
`viewer_data/boundaries/MyExperiment.json` + `viewer_data/boundaries/MyExperiment_nucleus.json`.
The viewer will expose a `graphclust` color mode out of the box.

Add k-means modes:
```bash
python3 scripts/bundle_to_viewer.py \
    --bundle my_xenium --sample-id MyExperiment --output viewer_data/ \
    --include-kmeans 2,5,10
```

Add transcripts (each gene = one JSON file; pick a small subset):
```bash
python3 scripts/bundle_to_viewer.py \
    --bundle my_xenium --sample-id MyExperiment --output viewer_data/ \
    --transcripts GAD1,GAD2,SLC17A7
```

Skip boundaries (saves ~80% of bytes if you only need centroids):
```bash
python3 scripts/bundle_to_viewer.py \
    --bundle my_xenium --sample-id MyExperiment --output viewer_data/ \
    --no-boundaries --no-nucleus
```

## Quickstart: AnnData → viewer

You have a `.h5ad` with cell-type annotations:

```bash
python3 scripts/anndata_to_viewer.py \
    --adata my_data.h5ad \
    --sample-id Br8667 \
    --output viewer_data/
```

The script auto-detects:
- All categorical obs columns (each becomes a color mode)
- Any `adata.uns['<col>_colors']` palettes (scanpy convention)
- A continuous depth/distance column (if one exists in `[0, 1]`)
- Numeric metadata columns (counts, cell_area, nucleus_area)

Override the guess explicitly:

```bash
python3 scripts/anndata_to_viewer.py \
    --adata my_data.h5ad --sample-id Br8667 --output viewer_data/ \
    --clusters subclass,supertype,layer \
    --depth normalized_depth \
    --xy-key spatial_um
```

Multi-sample (one h5ad with several donors via an obs column):

```bash
python3 scripts/anndata_to_viewer.py \
    --adata all_donors.h5ad \
    --sample-col donor_id \
    --output viewer_data/
```

Boundaries from a SpatialData zarr (optional):

```bash
python3 scripts/anndata_to_viewer.py \
    --adata my_data.h5ad --sample-id Br8667 --output viewer_data/ \
    --sdata my_data.zarr
```

## Wiring the output into a viewer

The converter produces JSONs only. You still need an HTML scaffold and
an adapter. The smallest path:

1. Copy `examples/minimal/` to a new directory.
2. Replace `examples/minimal/data/` with your `viewer_data/`.
3. Edit `data-adapter.js` to match the cluster-axis names in your
   sample JSON. For Xenium-bundle output, that's `graphclust` (and
   `kmeans_<k>` if you included them) instead of the default `subclass`.
4. Update the color-mode buttons in `index.html` accordingly.

See [`examples/minimal/README.md`](../examples/minimal/README.md) for
the per-file walkthrough.

## How the converters relate to segger

The platform field-name and filter-rule constants in
[`_platform_keys.py`](_platform_keys.py) are vendored from
[segger](https://github.com/EliHei2/segger_dev) (MIT). Segger is a
graph-neural-network cell-segmentation tool; we don't import it at
runtime — we'd have to install ~500MB of GPU deps for ~300 bytes of
constants. Just the schema mappings are reused, with attribution in
the file header. This means:

- Adding MERSCOPE / Vizgen support later is mostly wiring (`MerscopeKeys`
  is already in `_platform_keys.py`); no new schema research needed.
- If 10x or Vizgen change their schema, segger will likely catch it
  first; we can pull the diff.

## What's NOT supported (yet)

- **Reading SpatialData zarrs as the primary input.** Use anndata mode
  + `--sdata` to pull boundaries; the cell table still needs to live
  in an `.h5ad`. (Cleaner SpatialData integration is a future thing.)
- **Visium / Slide-seq / sequencing-based platforms.** These use bins
  or spots rather than segmented cells; the viewer's render primitives
  assume per-cell geometry.
- **MERSCOPE CLI.** Constants are in `_platform_keys.py` for future
  use, but `bundle_to_viewer.py` currently only handles Xenium.
- **Multi-modal data** (RNA + protein in one file). Run the converter
  per modality.

## Round-tripping the synthetic fixture

To smoke-test the converter on a known-good input:

```bash
# Regenerate the synthetic Xenium bundle (outputs are committed; only
# rerun if the schema changes)
python3 scripts/test_data/make_synthetic_xenium.py

# Convert it
python3 scripts/bundle_to_viewer.py \
    --bundle scripts/test_data/synthetic_xenium \
    --sample-id demo \
    --output /tmp/demo_out

# Inspect
ls -la /tmp/demo_out/
python3 -c "import json; print(list(json.load(open('/tmp/demo_out/demo.json'))))"
```

Or run the Playwright integration test:

```bash
npx playwright test tests/13_converter_e2e.spec.js
```

This spawns the converter, then renders its output via the viewer's
core primitives and asserts the canvas paints.
