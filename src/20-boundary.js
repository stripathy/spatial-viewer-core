/**
 * spatial-viewer-core — boundary polygon helpers.
 *
 * Two pure data transforms used by every viewer that overlays cell or
 * nucleus segmentation polygons on top of points.
 *
 * Attaches to window.SpatialViewerCore (created by 00-namespace.js).
 */
(function () {
  'use strict';
  const C = window.SpatialViewerCore;

  /**
   * Decode a wire-format boundary JSON blob into Float32 coordinate arrays.
   *
   * The input is the JSON shape produced by the upstream Python preprocessing
   * pipeline:
   *   {
   *     n_cells: number,
   *     verts_per_cell: number,        // fixed N — polygons padded to N verts
   *     x_offset, y_offset,            // global translation in µm
   *     x_scale,  y_scale,             // per-coord scaling (typically 1)
   *     bx: number[],                  // length n_cells * verts_per_cell
   *     by: number[]                   // length n_cells * verts_per_cell
   *   }
   *
   * Returns coordinate arrays already converted to absolute µm coordinates
   * (offset + scale applied), as Float32 for memory + GC efficiency.
   *
   * @param {object} raw The decoded JSON object.
   * @returns {{ n: number, vpc: number, bx: Float32Array, by: Float32Array }}
   */
  C.decodeBoundaryJson = function (raw) {
    const n = raw.n_cells;
    const vpc = raw.verts_per_cell;
    const xOff = raw.x_offset;
    const yOff = raw.y_offset;
    const xScale = raw.x_scale;
    const yScale = raw.y_scale;
    const totalVerts = n * vpc;
    const bx = new Float32Array(totalVerts);
    const by = new Float32Array(totalVerts);
    for (let i = 0; i < totalVerts; i++) {
      bx[i] = raw.bx[i] * xScale + xOff;
      by[i] = raw.by[i] * yScale + yOff;
    }
    return { n, vpc, bx, by };
  };

  /**
   * Build an Int32Array map from cell index → boundary polygon index.
   *
   * Boundary data may have fewer entries than the cell table (e.g. some cells
   * were dropped from the boundary set during QC). Both arrays are in the same
   * spatial order, so we walk them in lockstep and match cells to boundary
   * centroids within a small tolerance.
   *
   * Cells with no matching boundary get index `-1`.
   *
   * Pure function: returns the mapping rather than mutating any global state,
   * so callers can decide where to store it.
   *
   * @param {{ n: number, vpc: number, bx: Float32Array, by: Float32Array } | null} bd
   *        Decoded boundary data (output of `decodeBoundaryJson`), or `null`.
   * @param {{ n_cells: number, x: ArrayLike<number>, y: ArrayLike<number> } | null} sample
   *        The cell table (must expose `n_cells`, `x`, `y`).
   * @param {object} [opts]
   * @param {number} [opts.tol=5] µm tolerance for matching cell to centroid.
   * @returns {Int32Array | null} Per-cell boundary index, or `null` if either
   *   input is missing.
   */
  C.buildCellToBoundaryMap = function (bd, sample, opts) {
    if (!bd || !sample) return null;
    const tol = (opts && opts.tol != null) ? opts.tol : 5;
    const nCells = sample.n_cells;
    const nBound = bd.n;
    const map = new Int32Array(nCells).fill(-1);

    if (nCells === nBound) {
      for (let i = 0; i < nCells; i++) map[i] = i;
      return map;
    }

    const vpc = bd.vpc;
    const bcx = new Float32Array(nBound);
    const bcy = new Float32Array(nBound);
    for (let bi = 0; bi < nBound; bi++) {
      const base = bi * vpc;
      let sx = 0, sy = 0;
      for (let v = 0; v < vpc; v++) {
        sx += bd.bx[base + v];
        sy += bd.by[base + v];
      }
      bcx[bi] = sx / vpc;
      bcy[bi] = sy / vpc;
    }

    let bi = 0;
    const tolSq = tol * tol;
    for (let ci = 0; ci < nCells && bi < nBound; ci++) {
      const dx = sample.x[ci] - bcx[bi];
      const dy = sample.y[ci] - bcy[bi];
      if (dx * dx + dy * dy < tolSq) {
        map[ci] = bi;
        bi++;
      }
    }
    return map;
  };
})();
