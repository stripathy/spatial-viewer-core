#!/usr/bin/env python3
"""
Generate a tiny synthetic Xenium bundle for testing the converter.

The output is committed to the repo so converter tests don't need
to run this. Re-run only if the fixture schema needs to change.

Layout produced (matching XOA v4 conventions):
    synthetic_xenium/
        cells.parquet
        cell_boundaries.parquet
        nucleus_boundaries.parquet
        analysis/clustering/gene_expression_graphclust/clusters.csv
        # No transcripts.parquet — keeps the fixture small.
"""
import argparse
import gzip
from pathlib import Path
import random

import numpy as np
import pandas as pd

random.seed(42)
np.random.seed(42)

N = 200
W, H = 1000.0, 800.0
GENES = ["GAD1", "GAD2", "SLC17A7", "PVALB", "SST"]   # not actually used (no transcripts)


def make_cells():
    """Centroid table — mirrors cells.parquet schema."""
    cell_ids = [f"cell_{i:04d}" for i in range(N)]
    # Four quadrants → cluster pattern (graphclust will be fed these).
    quads = np.array([(i % 2) * (W / 2) for i in range(N)])
    quad_x = np.array([(i % 2) * (W / 2) for i in range(N)])
    quad_y = np.array([(i // 2 % 2) * (H / 2) for i in range(N)])
    x_centroid = quad_x + np.random.uniform(50, W / 2 - 50, N)
    y_centroid = quad_y + np.random.uniform(50, H / 2 - 50, N)
    transcript_counts = np.exp(np.random.normal(np.log(80), 0.4, N)).round().astype(int)
    cell_area = np.random.uniform(40, 120, N).round(2)
    nucleus_area = (cell_area * np.random.uniform(0.4, 0.7, N)).round(2)
    return pd.DataFrame({
        "cell_id": cell_ids,
        "x_centroid": x_centroid,
        "y_centroid": y_centroid,
        "transcript_counts": transcript_counts,
        "control_probe_counts": np.zeros(N, dtype=int),
        "control_codeword_counts": np.zeros(N, dtype=int),
        "unassigned_codeword_counts": np.zeros(N, dtype=int),
        "deprecated_codeword_counts": np.zeros(N, dtype=int),
        "total_counts": transcript_counts,
        "cell_area": cell_area,
        "nucleus_area": nucleus_area,
        "nucleus_count": np.ones(N, dtype=int),
        "segmentation_method": ["nuclear-expansion"] * N,
    })


def make_boundaries(cells: pd.DataFrame, half_side_um: float = 8.0):
    """Long-form boundary table: (cell_id, vertex_x, vertex_y, label_id).

    Each cell gets a 4-vertex square polygon centered on the centroid.
    """
    rows = []
    for i, row in cells.iterrows():
        cx, cy = row["x_centroid"], row["y_centroid"]
        s = half_side_um
        for vx, vy in [(cx - s, cy - s), (cx + s, cy - s),
                       (cx + s, cy + s), (cx - s, cy + s)]:
            rows.append((row["cell_id"], vx, vy, i + 1))
    return pd.DataFrame(rows, columns=["cell_id", "vertex_x", "vertex_y", "label_id"])


def make_graphclust(cells: pd.DataFrame):
    """Mock 10x graph-cluster CSV.  Cluster id = quadrant (1..4).

    Schema mirrors what XOA writes: Barcode, Cluster (where Cluster is
    integer-typed, 1-indexed).
    """
    # Recover quadrant from centroid position
    quad_x_idx = (cells["x_centroid"] >= W / 2).astype(int)
    quad_y_idx = (cells["y_centroid"] >= H / 2).astype(int)
    cluster = quad_y_idx * 2 + quad_x_idx + 1   # 1..4
    return pd.DataFrame({
        "Barcode": cells["cell_id"],
        "Cluster": cluster.astype(int),
    })


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--out", type=Path, default=Path(__file__).parent / "synthetic_xenium")
    args = p.parse_args()
    out = args.out
    out.mkdir(parents=True, exist_ok=True)

    cells = make_cells()
    bd = make_boundaries(cells, half_side_um=8.0)
    nuc = make_boundaries(cells, half_side_um=4.0)   # nuclei are smaller
    gc = make_graphclust(cells)

    cells.to_parquet(out / "cells.parquet")
    bd.to_parquet(out / "cell_boundaries.parquet")
    nuc.to_parquet(out / "nucleus_boundaries.parquet")
    cluster_dir = out / "analysis" / "clustering" / "gene_expression_graphclust"
    cluster_dir.mkdir(parents=True, exist_ok=True)
    gc.to_csv(cluster_dir / "clusters.csv", index=False)

    print(f"Wrote synthetic Xenium bundle to {out}")
    print(f"  cells: {len(cells)}  unique clusters: {gc['Cluster'].nunique()}")
    print(f"  boundary vertices: {len(bd)}  ({len(bd) // len(cells)} per cell)")


if __name__ == "__main__":
    main()
