#!/usr/bin/env python3
"""
Convert an annotated AnnData (.h5ad) into the JSON files this viewer reads.

Usage
-----
    # Most common: AnnData with one section
    python anndata_to_viewer.py \\
        --adata my_data.h5ad \\
        --sample-id Br8667 \\
        --output viewer_data/

    # Multi-section AnnData split by an obs column
    python anndata_to_viewer.py \\
        --adata all_samples.h5ad \\
        --sample-col donor_id \\
        --output viewer_data/

What this script assumes
------------------------
- Cell coordinates in ``adata.obsm['spatial']`` (the scanpy/squidpy
  default; override with ``--xy-key``).
- Cluster labels in ``adata.obs[<col>]`` for any column you want exposed
  as a color mode.
- Optional palettes in ``adata.uns['<col>_colors']`` (scanpy convention).
  If missing, palettes are auto-generated.

Auto-detection
--------------
By default the script picks up:
  - All categorical obs columns (each becomes a color mode)
  - All ``adata.uns['<col>_colors']`` keys (used as palettes for matching cols)
  - First numeric obs column whose name matches /depth|distance/i (continuous mode)
  - First numeric obs column whose name matches /count|nuc.*area|cell_area/ (tooltip)

Override any of these via CLI flags. Use ``--clusters foo,bar`` to
restrict color modes or ``--clusters none`` to disable.

Boundaries
----------
AnnData itself doesn't carry boundaries — they live in SpatialData. If you
have a SpatialData ``.zarr`` with a ``cell_boundaries`` shapes element,
pass ``--sdata my_data.zarr`` to extract polygons.  Without that, the
viewer falls back to point rendering only.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Optional, Sequence

import numpy as np

try:
    from . import _common
except ImportError:
    sys.path.insert(0, str(Path(__file__).parent))
    import _common


# ─── Auto-detection heuristics ─────────────────────────────────────────────

_DEPTH_PAT = re.compile(r"depth|distance", re.I)
_COUNT_PAT = re.compile(r"^(transcript_)?count|^total_count|n_count", re.I)
_AREA_PAT = re.compile(r"area$", re.I)


def _categorical_cols(adata) -> list[str]:
    """Return the names of obs columns that are categorical (cluster axes)."""
    out = []
    for col in adata.obs.columns:
        s = adata.obs[col]
        # pandas Categorical, or string-typed with low cardinality
        if hasattr(s, "cat"):
            out.append(col)
            continue
        if s.dtype == object and s.nunique(dropna=True) < min(200, len(s) // 2):
            out.append(col)
    return out


def _is_numeric(series) -> bool:
    """Safe numeric-dtype check that doesn't raise on pandas Categorical."""
    import pandas.api.types as pdt
    return pdt.is_numeric_dtype(series) and not pdt.is_bool_dtype(series)


def _depth_col(adata) -> Optional[str]:
    for col in adata.obs.columns:
        s = adata.obs[col]
        if not _is_numeric(s):
            continue
        if _DEPTH_PAT.search(col):
            vals = s.dropna()
            if len(vals) > 0 and 0 <= vals.min() and vals.max() <= 1.5:
                return col
    return None


# ─── Conversion ────────────────────────────────────────────────────────────

def convert(
    adata,
    sample_id: str,
    output: Path,
    *,
    cluster_cols: Optional[Sequence[str]] = None,
    depth_col: Optional[str] = None,
    xy_key: str = "spatial",
    cell_id_col: Optional[str] = None,
    boundary_polygons: Optional[dict] = None,
) -> None:
    """Write one sample's worth of JSONs into `output/`.

    For multi-sample AnnData, call this once per subsetted view.
    """
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)

    n_cells = adata.n_obs
    if xy_key not in adata.obsm:
        raise ValueError(f"adata.obsm['{xy_key}'] not found. Pass --xy-key to override.")
    xy = np.asarray(adata.obsm[xy_key])
    if xy.shape != (n_cells, 2):
        raise ValueError(f"adata.obsm['{xy_key}'] must be shape (n_cells, 2); got {xy.shape}")
    x, y = xy[:, 0].astype(float), xy[:, 1].astype(float)

    # Cell IDs: prefer obs[col] if specified, else adata.obs_names
    if cell_id_col and cell_id_col in adata.obs.columns:
        cell_ids = adata.obs[cell_id_col].astype(str).tolist()
    else:
        cell_ids = adata.obs_names.astype(str).tolist()

    # Cluster axes — auto-detect if not specified.
    if cluster_cols is None:
        cluster_cols = _categorical_cols(adata)
    elif cluster_cols == ["none"]:
        cluster_cols = []
    print(f"[anndata_to_viewer] sample={sample_id}, n_cells={n_cells}, cluster_axes={cluster_cols}")

    # Build per-sample blob.
    sample_blob: dict = {
        "sample_id": sample_id,
        "n_cells": n_cells,
        "x_range": [float(x.min()), float(x.max())],
        "y_range": [float(y.min()), float(y.max())],
        "x": x.tolist(),
        "y": y.tolist(),
        "cell_ids": cell_ids,
    }

    palettes: dict[str, dict] = {}
    for col in cluster_cols:
        s = adata.obs[col]
        if hasattr(s, "cat"):
            cats = list(s.cat.categories.astype(str))
            codes = s.cat.codes.to_numpy()
        else:
            cats, codes = _common.deduplicated_cats(s.astype(str).tolist())
        # Replace any -1 codes (NaN in pandas Categorical) with a synthetic 'NA' bucket
        if (codes < 0).any():
            cats = list(cats) + ["NA"]
            codes = np.where(codes < 0, len(cats) - 1, codes)
        sample_blob[f"{col}_cats"] = list(cats)
        sample_blob[col] = [int(c) for c in codes]

        # Palette: prefer adata.uns['<col>_colors']; fall back to default.
        uns_key = f"{col}_colors"
        override = _common.parse_uns_colors(adata.uns.get(uns_key), cats)
        palettes[col] = _common.make_palette(cats, override)

    # Continuous depth column.
    if depth_col is None:
        depth_col = _depth_col(adata)
    if depth_col and depth_col in adata.obs.columns:
        sample_blob["predicted_norm_depth"] = adata.obs[depth_col].astype(float).fillna(0.5).tolist()
        print(f"  exposing continuous depth: obs[{depth_col!r}]")

    # Numeric tooltip metadata (counts, areas).
    for col in adata.obs.columns:
        s = adata.obs[col]
        if not _is_numeric(s):
            continue
        if _COUNT_PAT.search(col) and "transcript_counts" not in sample_blob:
            sample_blob["transcript_counts"] = s.astype(float).tolist()
        elif _AREA_PAT.search(col):
            target = "cell_area" if "cell" in col.lower() else (
                     "nucleus_area" if "nuc" in col.lower() else None)
            if target and target not in sample_blob:
                sample_blob[target] = s.astype(float).tolist()

    _common.write_sample(output, sample_id, sample_blob)
    sz = (output / f"{sample_id}.json").stat().st_size
    print(f"  wrote {sample_id}.json ({sz / 1024:.0f} KB)")

    # Boundaries (if SpatialData was supplied).
    if boundary_polygons:
        bd_json = _common.encode_boundaries(boundary_polygons, n_cells, cell_ids)
        _common.write_boundaries(output, sample_id, bd_json, None)
        print(f"  wrote boundaries/{sample_id}.json ({len(boundary_polygons)} polygons)")

    # index.json — caller is responsible for writing this if they're
    # converting multiple samples in one batch.
    return {"sample": {"sample_id": sample_id, "n_cells": n_cells},
            "palettes": palettes}


def _load_boundaries_from_sdata(sdata_path: Path, shapes_key: str = "cell_boundaries") -> Optional[dict]:
    """Extract cell_id → (V,2) polygon dict from a SpatialData zarr.

    Returns None on failure (missing file, bad shape, missing geopandas).
    """
    try:
        import spatialdata as sd
    except ImportError:
        print(f"  WARN: --sdata supplied but spatialdata not installed; skipping boundaries")
        return None
    try:
        s = sd.read_zarr(str(sdata_path))
    except Exception as e:
        print(f"  WARN: failed to read {sdata_path}: {e}")
        return None
    if shapes_key not in s.shapes:
        print(f"  WARN: sdata.shapes['{shapes_key}'] not found")
        return None
    gdf = s.shapes[shapes_key]
    out = {}
    for cid, geom in gdf.geometry.items():
        # Polygons may have holes; we only take the exterior.
        try:
            coords = np.asarray(geom.exterior.coords)[:-1]   # drop closing duplicate
            out[str(cid)] = coords
        except Exception:
            continue
    return out


def main():
    p = argparse.ArgumentParser(
        description="Convert an AnnData (and optional SpatialData) into spatial-viewer-core JSONs.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument("--adata", required=True, type=Path,
                   help="Path to a .h5ad file")
    p.add_argument("--output", required=True, type=Path,
                   help="Output directory")
    p.add_argument("--sample-id", default=None,
                   help="Sample id for single-section AnnData. Required unless --sample-col is set.")
    p.add_argument("--sample-col", default=None,
                   help="obs column name to split by (multi-sample AnnData). "
                        "If set, one output sample per unique value in this column.")
    p.add_argument("--xy-key", default="spatial",
                   help="adata.obsm key holding (n_cells, 2) coordinates")
    p.add_argument("--cell-id-col", default=None,
                   help="obs column to use as cell_id (default: adata.obs_names)")
    p.add_argument("--clusters", default=None, type=lambda s: [x.strip() for x in s.split(",")],
                   help="Comma-separated obs columns to expose as cluster axes. "
                        "Default: auto-detect categorical columns. Use 'none' to disable.")
    p.add_argument("--depth", default=None,
                   help="obs column for continuous depth/distance mode. Default: auto-detect.")
    p.add_argument("--sdata", default=None, type=Path,
                   help="Optional SpatialData .zarr path to pull cell boundary polygons from")
    args = p.parse_args()

    try:
        import anndata as ad
    except ImportError:
        sys.exit("anndata not installed. `pip install anndata`")

    print(f"[anndata_to_viewer] reading {args.adata}")
    adata = ad.read_h5ad(args.adata)
    print(f"  {adata}")

    boundary_polys = None
    if args.sdata:
        boundary_polys = _load_boundaries_from_sdata(args.sdata)

    palettes_combined: dict[str, dict] = {}
    samples_meta: list[dict] = []

    if args.sample_col is not None:
        if args.sample_col not in adata.obs.columns:
            sys.exit(f"--sample-col {args.sample_col!r} not found in adata.obs")
        for sample_id in adata.obs[args.sample_col].astype(str).unique():
            sub = adata[adata.obs[args.sample_col].astype(str) == sample_id].copy()
            # Boundaries are sample-scoped; if we have global polygons,
            # subset by cell_ids.
            sub_polys = None
            if boundary_polys:
                cids = (sub.obs[args.cell_id_col].astype(str).tolist()
                        if args.cell_id_col else sub.obs_names.astype(str).tolist())
                sub_polys = {c: boundary_polys[c] for c in cids if c in boundary_polys} or None
            result = convert(
                sub, sample_id, args.output,
                cluster_cols=args.clusters,
                depth_col=args.depth,
                xy_key=args.xy_key,
                cell_id_col=args.cell_id_col,
                boundary_polygons=sub_polys,
            )
            samples_meta.append(result["sample"])
            for k, v in result["palettes"].items():
                palettes_combined.setdefault(k, {}).update(v)
    else:
        if not args.sample_id:
            sys.exit("Provide either --sample-id (single sample) or --sample-col (multi-sample)")
        result = convert(
            adata, args.sample_id, args.output,
            cluster_cols=args.clusters,
            depth_col=args.depth,
            xy_key=args.xy_key,
            cell_id_col=args.cell_id_col,
            boundary_polygons=boundary_polys,
        )
        samples_meta.append(result["sample"])
        palettes_combined = result["palettes"]

    _common.write_index(args.output, samples_meta, palettes_combined)
    print(f"[anndata_to_viewer] done → {args.output}")


if __name__ == "__main__":
    main()
