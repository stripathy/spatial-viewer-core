"""
Shared utilities for converters: JSON writing, palette generation,
boundary encoding, transcript-file packaging.

The output JSON shapes match `docs/data-format.md` in this repo.
"""
import gzip
import json
import os
from pathlib import Path
from typing import Iterable, Mapping, Optional, Sequence

import numpy as np


# ─── Palettes ──────────────────────────────────────────────────────────────

# A 20-color qualitative palette (tab20-like, vetted for dark backgrounds).
# Used when the user hasn't supplied one and `<col>_colors` isn't in
# adata.uns. Matches scanpy's default categorical palette closely.
_DEFAULT_PALETTE = [
    "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
    "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
    "#aec7e8", "#ffbb78", "#98df8a", "#ff9896", "#c5b0d5",
    "#c49c94", "#f7b6d2", "#c7c7c7", "#dbdb8d", "#9edae5",
]


def make_palette(category_names: Sequence[str],
                 override: Optional[Mapping[str, str]] = None) -> dict:
    """Return a dict mapping category_name → '#hex'.

    If ``override`` is provided, names present in it use that color;
    others fall through to the default cycling palette.
    """
    out = {}
    override = override or {}
    for i, name in enumerate(category_names):
        if name in override:
            out[name] = override[name]
        else:
            out[name] = _DEFAULT_PALETTE[i % len(_DEFAULT_PALETTE)]
    return out


def parse_uns_colors(uns_value, category_names: Sequence[str]) -> dict:
    """Convert scanpy's `adata.uns['<col>_colors']` to a name→hex dict.

    scanpy stores colors as a list parallel to the categorical's `.cat.categories`,
    not as a dict — so we have to zip back to names.
    """
    if uns_value is None:
        return {}
    if isinstance(uns_value, dict):
        return dict(uns_value)
    # list-like; zip with category_names
    if len(uns_value) != len(category_names):
        return {}  # mismatch — punt to default
    return dict(zip(category_names, [str(c) for c in uns_value]))


# ─── Boundary encoding (matches docs/data-format.md) ───────────────────────

def encode_boundaries(
    cell_id_to_polygon: Mapping[str, np.ndarray],
    sample_n_cells: int,
    cell_id_order: Optional[Sequence[str]] = None,
) -> Optional[dict]:
    """Encode a cell_id → (V,2) polygon dict into the viewer's boundary JSON.

    Returns the JSON-ready dict shape:
        { n_cells, n_with_boundary, verts_per_cell,
          x_offset, y_offset, x_scale, y_scale, bx, by }

    ``bx`` and ``by`` are stored as int16-with-offset+scale to save bytes.
    Polygons with fewer vertices than the maximum are padded by repeating
    the last real vertex (no visible artifact).

    Parameters
    ----------
    cell_id_to_polygon
        Mapping cell_id → array of shape (V, 2) in µm. Different cells may
        have different V; we pad to the max.
    sample_n_cells
        Total cells in the per-sample JSON; emitted as ``n_cells`` so the
        viewer's ``buildCellToBoundaryMap`` can detect the mismatched case.
    cell_id_order
        If provided, polygons are emitted in this order (one per cell;
        cells without polygons skipped).  If None, dict iteration order.
    """
    if not cell_id_to_polygon:
        return None

    if cell_id_order is None:
        cell_id_order = list(cell_id_to_polygon.keys())

    polys = [cell_id_to_polygon[cid] for cid in cell_id_order if cid in cell_id_to_polygon]
    if not polys:
        return None

    n = len(polys)
    vpc = max(len(p) for p in polys)

    # Compute scale + offset to fit all coords in int16.
    all_xy = np.concatenate(polys, axis=0)
    x_min, y_min = float(all_xy[:, 0].min()), float(all_xy[:, 1].min())
    x_max, y_max = float(all_xy[:, 0].max()), float(all_xy[:, 1].max())
    span_x = max(x_max - x_min, 1.0)
    span_y = max(y_max - y_min, 1.0)
    # int16 max is 32767; aim for 95% of that to leave headroom
    scale_x = 0.05 if span_x < 1500 else (span_x / 30000)
    scale_y = 0.05 if span_y < 1500 else (span_y / 30000)
    x_off = x_min
    y_off = y_min

    bx = np.zeros(n * vpc, dtype=np.int32)
    by = np.zeros(n * vpc, dtype=np.int32)
    for i, p in enumerate(polys):
        v = len(p)
        for j in range(vpc):
            src = p[j] if j < v else p[-1]   # pad with last vertex
            bx[i * vpc + j] = int(round((src[0] - x_off) / scale_x))
            by[i * vpc + j] = int(round((src[1] - y_off) / scale_y))

    return {
        "n_cells": int(sample_n_cells),
        "n_with_boundary": int(n),
        "verts_per_cell": int(vpc),
        "x_offset": x_off,
        "y_offset": y_off,
        "x_scale": float(scale_x),
        "y_scale": float(scale_y),
        "bx": bx.tolist(),
        "by": by.tolist(),
    }


# ─── Transcript packaging ──────────────────────────────────────────────────

def write_transcripts(
    out_dir: Path,
    sample_id: str,
    gene_to_xy: Mapping[str, np.ndarray],
) -> dict:
    """Write per-gene transcript JSONs + a gene_index.json.

    Returns the gene_index dict (matches docs/data-format.md).

    Each per-gene JSON is integer-encoded (saves ~50% bytes vs floats).
    """
    sample_dir = out_dir / "transcripts" / sample_id
    sample_dir.mkdir(parents=True, exist_ok=True)

    if not gene_to_xy:
        index = {
            "sample_id": sample_id,
            "n_genes": 0,
            "total_transcripts": 0,
            "x_offset": 0.0, "y_offset": 0.0,
            "x_scale": 1.0, "y_scale": 1.0,
            "genes": [],
        }
        (sample_dir / "gene_index.json").write_text(json.dumps(index))
        return index

    # Compute global offset+scale across all genes.
    all_xy = np.concatenate([xy for xy in gene_to_xy.values()], axis=0)
    x_min, y_min = float(all_xy[:, 0].min()), float(all_xy[:, 1].min())
    x_max, y_max = float(all_xy[:, 0].max()), float(all_xy[:, 1].max())
    # Per-molecule positions are typically in µm with sub-µm resolution;
    # 0.1µm precision is sub-pixel for any zoom we care about.
    scale = 0.1
    x_off = x_min
    y_off = y_min

    genes_meta = []
    total = 0
    for gene, xy in sorted(gene_to_xy.items()):
        n = len(xy)
        if n == 0:
            continue
        x_int = ((xy[:, 0] - x_off) / scale).round().astype(np.int32).tolist()
        y_int = ((xy[:, 1] - y_off) / scale).round().astype(np.int32).tolist()
        out = {"gene": gene, "n": n, "x": x_int, "y": y_int}
        out_file = sample_dir / f"{gene}.json"
        out_file.write_text(json.dumps(out))
        genes_meta.append({
            "gene": gene,
            "n": n,
            "file": f"{gene}.json",
            "size_kb": round(out_file.stat().st_size / 1024, 1),
        })
        total += n

    index = {
        "sample_id": sample_id,
        "n_genes": len(genes_meta),
        "total_transcripts": total,
        "x_offset": x_off,
        "y_offset": y_off,
        "x_scale": scale,
        "y_scale": scale,
        "genes": genes_meta,
    }
    (sample_dir / "gene_index.json").write_text(json.dumps(index))
    return index


# ─── Top-level JSON writers ────────────────────────────────────────────────

def write_index(out_dir: Path,
                samples: Sequence[dict],
                color_palettes: Mapping[str, Mapping[str, str]],
                extra: Optional[dict] = None) -> None:
    """Write index.json with samples + flat-style color palettes (per Q6)."""
    out = {"samples": list(samples)}
    for col_name, palette in color_palettes.items():
        out[f"{col_name}_colors"] = dict(palette)
    if extra:
        out.update(extra)
    (out_dir / "index.json").write_text(json.dumps(out, indent=2))


def write_sample(out_dir: Path,
                 sample_id: str,
                 sample_blob: dict) -> None:
    """Write per-sample JSON (no pretty-printing — these can be megabytes)."""
    (out_dir / f"{sample_id}.json").write_text(json.dumps(sample_blob))


def write_boundaries(out_dir: Path,
                     sample_id: str,
                     cell_boundaries: Optional[dict],
                     nucleus_boundaries: Optional[dict] = None) -> None:
    """Write boundaries/<sample_id>.json + optional _nucleus.json."""
    if not cell_boundaries and not nucleus_boundaries:
        return
    bdir = out_dir / "boundaries"
    bdir.mkdir(exist_ok=True)
    if cell_boundaries:
        (bdir / f"{sample_id}.json").write_text(json.dumps(cell_boundaries))
    if nucleus_boundaries:
        (bdir / f"{sample_id}_nucleus.json").write_text(json.dumps(nucleus_boundaries))


# ─── Misc helpers ──────────────────────────────────────────────────────────

def deduplicated_cats(values: Iterable) -> tuple[list, np.ndarray]:
    """Like pandas.Categorical, but deps-free.

    Returns (cats, codes) where cats is a list of unique values in
    first-seen order and codes is an int array of indices into cats.
    """
    values_list = list(values)
    seen = {}
    cats = []
    codes = np.zeros(len(values_list), dtype=np.int32)
    for i, v in enumerate(values_list):
        if v not in seen:
            seen[v] = len(cats)
            cats.append(v)
        codes[i] = seen[v]
    return cats, codes
