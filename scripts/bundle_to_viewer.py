#!/usr/bin/env python3
"""
Convert a 10x Xenium output bundle into the JSON files this viewer reads.

Usage
-----
    python bundle_to_viewer.py \\
        --bundle /path/to/Xenium_output \\
        --sample-id MyExperiment \\
        --output viewer_data/

What you get
------------
    viewer_data/
        index.json
        MyExperiment.json
        boundaries/
            MyExperiment.json           (cell boundaries; if --boundaries kept)
            MyExperiment_nucleus.json   (nucleus boundaries; if --boundaries kept)
        transcripts/                    (only if --transcripts gene1,gene2,...)
            MyExperiment/
                gene_index.json
                <gene>.json

You can run the resulting `viewer_data/` directly with the example viewer:
copy `examples/minimal/{index.html,style.css,viewer.js,data-adapter.js}` next to it
and replace the example's `data/` symlink/directory.

Inputs expected
---------------
The script assumes a Xenium Onboard Analysis output bundle. Required files
(see https://www.10xgenomics.com/support/software/xenium-onboard-analysis):

    cells.parquet  OR  cells.csv.gz
    cell_boundaries.parquet  OR  cell_boundaries.csv.gz   (if --boundaries kept)
    nucleus_boundaries.parquet  (similar)
    analysis/clustering/gene_expression_graphclust/clusters.csv  (cluster labels)
    transcripts.parquet                                          (if --transcripts)

If your bundle is from Xenium Ranger or an older XOA version, file names
should match. Open an issue if you hit a missing variant.

Cluster modes exposed in the viewer
-----------------------------------
By default this script exposes a `graphclust` color mode (10x's automatic
graph-based cluster). Pass `--include-kmeans 2,3,...` to also expose
k-means clusters. There are no biological annotations from this bundle —
this is the "I just got the data, what does it look like" path.

For an annotated workflow (you have an AnnData with curated cell types),
use `anndata_to_viewer.py` instead.
"""
from __future__ import annotations

import argparse
import gzip
import json
import sys
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

try:
    from . import _common, _platform_keys as keys_mod
except ImportError:
    # Running as a script (not a module).  Allow `python bundle_to_viewer.py`.
    sys.path.insert(0, str(Path(__file__).parent))
    import _common
    import _platform_keys as keys_mod


XK = keys_mod.XeniumKeys


# ─── Path resolution (handle .parquet / .csv.gz alternatives) ───────────────

def _read_table(bundle: Path, *names: str) -> pd.DataFrame:
    """Read the first existing file out of `names`, dispatching by suffix."""
    for n in names:
        p = bundle / n
        if not p.exists():
            continue
        if p.suffix == ".parquet":
            return pd.read_parquet(p)
        if p.suffixes[-2:] == [".csv", ".gz"]:
            with gzip.open(p, "rt") as f:
                return pd.read_csv(f)
        if p.suffix == ".csv":
            return pd.read_csv(p)
    raise FileNotFoundError(
        f"None of these found in {bundle}: {names}. Is this a Xenium bundle?"
    )


def _maybe_read_table(bundle: Path, *names: str) -> Optional[pd.DataFrame]:
    """Like _read_table but returns None on missing files."""
    try:
        return _read_table(bundle, *names)
    except FileNotFoundError:
        return None


# ─── Cluster files ──────────────────────────────────────────────────────────

def _read_clusters(bundle: Path, rel_path: str) -> Optional[pd.DataFrame]:
    """10x cluster CSVs have columns: Barcode, Cluster.  Return a DataFrame
    indexed by cell_id with a string cluster label per row, or None if missing."""
    p = bundle / rel_path
    if not p.exists():
        return None
    df = pd.read_csv(p)
    # 10x cluster CSVs use 'Barcode' as the cell id; integer 'Cluster' col
    if "Barcode" not in df.columns or "Cluster" not in df.columns:
        return None
    df = df.rename(columns={"Barcode": "cell_id", "Cluster": "cluster"})
    df["cluster"] = df["cluster"].astype(str).map(lambda c: f"cluster_{c}")
    return df.set_index("cell_id")


# ─── Boundary handling ──────────────────────────────────────────────────────

def _build_boundary_polygons(
    boundary_df: pd.DataFrame,
) -> dict:
    """Group long-form boundary rows (cell_id, vertex_x, vertex_y) into
    one (V, 2) array per cell_id."""
    out = {}
    cid_col = XK.CELL_ID.value
    vx = XK.BOUNDARIES_VERTEX_X.value
    vy = XK.BOUNDARIES_VERTEX_Y.value
    # groupby preserves vertex order within each cell as long as the input
    # is ordered (which 10x bundles are).
    for cid, sub in boundary_df.groupby(cid_col, sort=False):
        out[str(cid)] = sub[[vx, vy]].to_numpy(dtype=np.float64)
    return out


# ─── Transcript handling ────────────────────────────────────────────────────

def _filter_transcripts_xenium(transcripts: pd.DataFrame, min_qv: float) -> pd.DataFrame:
    """Drop neg-control / blank / unassigned codeword probes + low-QV calls.

    Filter logic vendored from segger's XeniumSample.filter_transcripts."""
    feat_col = XK.FEATURE_NAME.value
    qv_col = XK.QUALITY_VALUE.value

    if pd.api.types.is_object_dtype(transcripts[feat_col]):
        transcripts[feat_col] = transcripts[feat_col].apply(
            lambda x: x.decode("utf-8") if isinstance(x, bytes) else x
        )

    mask = pd.Series(True, index=transcripts.index)
    if qv_col in transcripts.columns:
        mask &= transcripts[qv_col] >= min_qv
    for prefix in keys_mod.XENIUM_TRANSCRIPT_FILTER_PREFIXES:
        mask &= ~transcripts[feat_col].astype(str).str.startswith(prefix)
    return transcripts[mask].copy()


# ─── Main ────────────────────────────────────────────────────────────────────

def convert(
    bundle: Path,
    sample_id: str,
    output: Path,
    *,
    include_boundaries: bool = True,
    include_nucleus: bool = True,
    include_transcripts: list[str] = None,
    include_kmeans: list[int] = None,
    min_qv: float = keys_mod.XENIUM_DEFAULT_MIN_QV,
) -> None:
    """Run the full conversion. Writes into `output/`."""
    bundle = Path(bundle).resolve()
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=True)

    print(f"[bundle_to_viewer] reading {bundle}")

    # ---- 1. Cell metadata (centroids, area, counts, qc) ----------------------
    cells = _read_table(bundle, XK.CELL_METADATA_FILE.value, "cells.csv.gz")
    n_cells = len(cells)
    cell_ids = cells[XK.CELL_ID.value].astype(str).tolist()
    x = cells[XK.CELL_X.value].astype(float).tolist()
    y = cells[XK.CELL_Y.value].astype(float).tolist()
    x_arr = np.asarray(x); y_arr = np.asarray(y)
    print(f"  cells: n={n_cells}, x={x_arr.min():.1f}–{x_arr.max():.1f}µm, y={y_arr.min():.1f}–{y_arr.max():.1f}µm")

    # ---- 2. Cluster axes (graphclust always; kmeans on demand) ---------------
    cluster_axes: dict[str, dict] = {}   # axis_name → { cats, codes }
    palettes: dict[str, dict] = {}       # axis_name → name → hex

    graph = _read_clusters(bundle, XK.GRAPHCLUST_FILE.value)
    if graph is not None:
        cluster_labels = [graph["cluster"].get(c, "cluster_NA") for c in cell_ids]
        cats, codes = _common.deduplicated_cats(cluster_labels)
        # Sort cats by trailing integer so 'cluster_2' precedes 'cluster_10'.
        def _sort_key(name: str):
            try: return (0, int(name.split("_")[-1]))
            except ValueError: return (1, name)
        cats_sorted = sorted(cats, key=_sort_key)
        remap = {old_idx: new_idx for new_idx, name in enumerate(cats_sorted)
                 for old_idx, n in enumerate(cats) if n == name}
        codes_sorted = np.array([remap[c] for c in codes], dtype=np.int32)
        cluster_axes["graphclust"] = {"cats": cats_sorted, "codes": codes_sorted.tolist()}
        palettes["graphclust"] = _common.make_palette(cats_sorted)
        print(f"  graphclust: {len(cats_sorted)} clusters")
    else:
        print("  WARN: no graphclust file found; viewer will have no cluster mode")

    for k in (include_kmeans or []):
        rel = XK.KMEANS_DIR_PATTERN.value.format(k=k)
        kmeans = _read_clusters(bundle, rel)
        if kmeans is None:
            print(f"  WARN: kmeans_{k} requested but {rel} not found; skipping")
            continue
        labels = [kmeans["cluster"].get(c, "cluster_NA") for c in cell_ids]
        cats, codes = _common.deduplicated_cats(labels)
        cats_sorted = sorted(cats)
        remap = {old_idx: new_idx for new_idx, name in enumerate(cats_sorted)
                 for old_idx, n in enumerate(cats) if n == name}
        codes_sorted = np.array([remap[c] for c in codes], dtype=np.int32)
        axis = f"kmeans_{k}"
        cluster_axes[axis] = {"cats": cats_sorted, "codes": codes_sorted.tolist()}
        palettes[axis] = _common.make_palette(cats_sorted)
        print(f"  {axis}: {len(cats_sorted)} clusters")

    # ---- 3. Per-sample blob --------------------------------------------------
    sample_blob: dict = {
        "sample_id": sample_id,
        "n_cells": n_cells,
        "x_range": [float(x_arr.min()), float(x_arr.max())],
        "y_range": [float(y_arr.min()), float(y_arr.max())],
        "x": x,
        "y": y,
        "cell_ids": cell_ids,
    }
    # Cluster axes are stored flat: <axis>_cats + <axis>
    for axis, blob in cluster_axes.items():
        sample_blob[f"{axis}_cats"] = blob["cats"]
        sample_blob[axis] = blob["codes"]

    # Optional metadata fields the viewer's tooltip can pick up.
    for col, dst in [("transcript_counts", "transcript_counts"),
                     ("cell_area", "cell_area"),
                     ("nucleus_area", "nucleus_area")]:
        if col in cells.columns:
            sample_blob[dst] = cells[col].astype(float).tolist()

    _common.write_sample(output, sample_id, sample_blob)
    print(f"  wrote {sample_id}.json ({(output / f'{sample_id}.json').stat().st_size / 1024:.0f} KB)")

    # ---- 4. Boundaries -------------------------------------------------------
    cell_bd_json = nuc_bd_json = None
    if include_boundaries:
        bd_df = _maybe_read_table(bundle, XK.BOUNDARIES_FILE.value, "cell_boundaries.csv.gz")
        if bd_df is not None:
            cell_bd_polys = _build_boundary_polygons(bd_df)
            cell_bd_json = _common.encode_boundaries(cell_bd_polys, n_cells, cell_ids)
            print(f"  cell boundaries: {len(cell_bd_polys)} polygons")
        else:
            print("  no cell_boundaries file found; skipping")
    if include_nucleus:
        nuc_df = _maybe_read_table(bundle, XK.NUCLEUS_BOUNDARIES_FILE.value, "nucleus_boundaries.csv.gz")
        if nuc_df is not None:
            nuc_polys = _build_boundary_polygons(nuc_df)
            nuc_bd_json = _common.encode_boundaries(nuc_polys, n_cells, cell_ids)
            print(f"  nucleus boundaries: {len(nuc_polys)} polygons")
    _common.write_boundaries(output, sample_id, cell_bd_json, nuc_bd_json)

    # ---- 5. Transcripts (opt-in) ---------------------------------------------
    if include_transcripts:
        tx_path = bundle / XK.TRANSCRIPTS_FILE.value
        if not tx_path.exists():
            print(f"  WARN: --transcripts requested but {tx_path} not found")
        else:
            print(f"  reading transcripts (this may take a minute)…")
            tx = pd.read_parquet(tx_path)
            tx = _filter_transcripts_xenium(tx, min_qv)
            wanted = set(include_transcripts)
            tx = tx[tx[XK.FEATURE_NAME.value].astype(str).isin(wanted)]
            print(f"  transcripts after filtering: {len(tx)} molecules across {tx[XK.FEATURE_NAME.value].nunique()} genes")
            gene_to_xy = {}
            for gene, sub in tx.groupby(XK.FEATURE_NAME.value):
                gene_to_xy[str(gene)] = sub[[XK.TRANSCRIPTS_X.value, XK.TRANSCRIPTS_Y.value]].to_numpy(dtype=np.float64)
            _common.write_transcripts(output, sample_id, gene_to_xy)
            print(f"  wrote transcripts/{sample_id}/")

    # ---- 6. index.json -------------------------------------------------------
    samples_meta = [{"sample_id": sample_id, "n_cells": n_cells}]
    _common.write_index(output, samples_meta, palettes)
    print(f"  wrote index.json")

    print(f"[bundle_to_viewer] done → {output}")


def _parse_kmeans_arg(s: str) -> list[int]:
    if not s:
        return []
    return [int(x.strip()) for x in s.split(",") if x.strip()]


def _parse_genes_arg(s: str) -> list[str]:
    if not s:
        return []
    return [x.strip() for x in s.split(",") if x.strip()]


def main():
    p = argparse.ArgumentParser(
        description="Convert a 10x Xenium output bundle into spatial-viewer-core JSONs.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument("--bundle", required=True, type=Path,
                   help="Path to the Xenium output directory (contains cells.parquet, etc.)")
    p.add_argument("--sample-id", required=True,
                   help="Identifier for this sample in the viewer (becomes filename + sidebar label)")
    p.add_argument("--output", required=True, type=Path,
                   help="Output directory for viewer JSONs")
    p.add_argument("--no-boundaries", dest="boundaries", action="store_false",
                   help="Skip cell boundary polygons")
    p.add_argument("--no-nucleus", dest="nucleus", action="store_false",
                   help="Skip nucleus boundary polygons")
    p.add_argument("--transcripts", default="", type=_parse_genes_arg,
                   help="Comma-separated list of gene symbols to export as transcript overlays. "
                        "Empty = no transcripts. (Use sparingly: each gene is a separate JSON.)")
    p.add_argument("--include-kmeans", default="", type=_parse_kmeans_arg,
                   help="Comma-separated k values to include kmeans clustering modes "
                        "(e.g. '2,5,10'). 10x bundles include kmeans for k=2..10 by default.")
    p.add_argument("--min-qv", type=float, default=keys_mod.XENIUM_DEFAULT_MIN_QV,
                   help="Minimum transcript quality value (Xenium QV).")
    args = p.parse_args()

    convert(
        bundle=args.bundle,
        sample_id=args.sample_id,
        output=args.output,
        include_boundaries=args.boundaries,
        include_nucleus=args.nucleus,
        include_transcripts=args.transcripts,
        include_kmeans=args.include_kmeans,
        min_qv=args.min_qv,
    )


if __name__ == "__main__":
    main()
