/**
 * spatial-viewer-core — hover hit-test functions.
 *
 * Two pure functions: hitTestMolecule (transcript dots) and hitTestCell
 * (cell centroids OR boundary point-in-polygon). Both return either a
 * match object or null. Tooltip-HTML construction stays in viewer-land
 * (heavily study-specific) — these only do hit detection.
 *
 * Attaches to window.SpatialViewerCore (created by 00-namespace.js).
 */
(function () {
  'use strict';
  const C = window.SpatialViewerCore;

  /**
   * Find the closest transcript-molecule dot to the mouse cursor.
   *
   * Distance is computed in DATA coordinates (µm), not screen pixels, so
   * the threshold scales naturally with zoom. Uses a frustum cull in
   * data space to skip offscreen molecules cheaply.
   *
   * @param {object} opts
   * @param {number} opts.mx                Mouse X in canvas px.
   * @param {number} opts.my                Mouse Y in canvas px.
   * @param {object} opts.transcriptGenes   Map: gene → { x, y, n, color }.
   * @param {Iterable<string>} opts.activeGenes
   * @param {number} opts.viewScale
   * @param {number} opts.viewX
   * @param {number} opts.viewY
   * @param {number} opts.w                 Canvas logical width.
   * @param {number} opts.h                 Canvas logical height.
   * @param {number} opts.moleculeSize      Used to derive hit threshold.
   * @returns {{ gene: string, idx: number, distSq: number } | null}
   */
  C.hitTestMolecule = function (opts) {
    const { mx, my, transcriptGenes, activeGenes,
            viewScale, viewX, viewY, w, h, moleculeSize } = opts;

    const molThreshPx = Math.max(15, moleculeSize * 5);
    const molThreshData = molThreshPx / viewScale;
    const molThreshData2 = molThreshData * molThreshData;
    const mxData = (mx - viewX) / viewScale;
    const myData = (my - viewY) / viewScale;

    // 20px margin on visible data range, expressed in data coords.
    const margin = 20 / viewScale;
    const dataXMin = -viewX / viewScale - margin;
    const dataXMax = (w - viewX) / viewScale + margin;
    const dataYMin = -viewY / viewScale - margin;
    const dataYMax = (h - viewY) / viewScale + margin;

    let bestDist = Infinity;
    let bestGene = null;
    let bestIdx = -1;
    for (const gene of activeGenes) {
      const gd = transcriptGenes[gene];
      if (!gd) continue;
      const gx = gd.x, gy = gd.y, gn = gd.n;
      for (let i = 0; i < gn; i++) {
        const px = gx[i], py = gy[i];
        if (px < dataXMin || px > dataXMax || py < dataYMin || py > dataYMax) continue;
        const dx = mxData - px;
        const dy = myData - py;
        const d2 = dx * dx + dy * dy;
        if (d2 < molThreshData2 && d2 < bestDist) {
          bestDist = d2;
          bestGene = gene;
          bestIdx = i;
        }
      }
    }
    return bestGene == null ? null : { gene: bestGene, idx: bestIdx, distSq: bestDist };
  };

  /**
   * Find the closest cell to the mouse cursor.
   *
   * Two modes (caller picks via `useBoundary`):
   *   - Boundary mode: ray-casting point-in-polygon, gated on a 50µm
   *     centroid pre-filter. Ties (overlapping polygons) broken by
   *     centroid distance.
   *   - Centroid mode: nearest-centroid in screen space, capped at
   *     `max(20, pointSize*3)` pixels.
   *
   * @param {object} opts
   * @param {number} opts.mx                Mouse X in canvas px.
   * @param {number} opts.my                Mouse Y in canvas px.
   * @param {Float32Array|number[]} opts.x  Cell centroid X (data coords).
   * @param {Float32Array|number[]} opts.y  Cell centroid Y (data coords).
   * @param {number} opts.n
   * @param {Uint8Array} opts.passes        Per-cell hover mask (1=hoverable).
   * @param {Uint8Array} [opts.isDeselected] Optional: cells flagged as
   *   "filtered out but still hoverable" (set when showDeselectedCells).
   *   The match's `isDeselected` bit echoes `isDeselected[idx] === 1`.
   * @param {number} opts.viewScale
   * @param {number} opts.viewX
   * @param {number} opts.viewY
   * @param {boolean} opts.useBoundary      True → polygon hit test.
   * @param {object} [opts.boundaryData]    Required when useBoundary=true.
   * @param {Int32Array} [opts.bMap]
   * @param {number} [opts.pointSize]       Used for centroid threshold.
   * @returns {{ idx: number, distSq: number, isDeselected: boolean } | null}
   */
  C.hitTestCell = function (opts) {
    const { mx, my, x, y, n, passes, viewScale, viewX, viewY, useBoundary } = opts;
    const isDeselected = opts.isDeselected || null;

    let bestDist = Infinity;
    let bestIdx = -1;

    if (useBoundary) {
      const bd = opts.boundaryData;
      const bMap = opts.bMap || null;
      const mxD = (mx - viewX) / viewScale;
      const myD = (my - viewY) / viewScale;
      const sr = 50;          // pre-filter radius in µm (centroid distance gate)
      const sr2 = sr * sr;
      const vpc = bd.vpc;
      for (let i = 0; i < n; i++) {
        if (!passes[i]) continue;
        const bi = bMap ? bMap[i] : i;
        if (bi < 0 || bi >= bd.n) continue;
        const cdx = mxD - x[i];
        const cdy = myD - y[i];
        const cd2 = cdx * cdx + cdy * cdy;
        if (cd2 > sr2) continue;
        // Ray-casting point-in-polygon
        const base = bi * vpc;
        let inside = false;
        for (let v = 0, w = vpc - 1; v < vpc; w = v++) {
          const vx = bd.bx[base + v], vy = bd.by[base + v];
          const wx = bd.bx[base + w], wy = bd.by[base + w];
          if (((vy > myD) !== (wy > myD))
              && (mxD < (wx - vx) * (myD - vy) / (wy - vy) + vx)) {
            inside = !inside;
          }
        }
        if (inside && cd2 < bestDist) {
          bestDist = cd2;
          bestIdx = i;
        }
      }
    } else {
      const pointSize = opts.pointSize != null ? opts.pointSize : 2;
      const cellThreshold = Math.max(20, pointSize * 3);
      bestDist = cellThreshold * cellThreshold;
      for (let i = 0; i < n; i++) {
        if (!passes[i]) continue;
        const sx = x[i] * viewScale + viewX;
        const sy = y[i] * viewScale + viewY;
        const dx = mx - sx;
        const dy = my - sy;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDist) {
          bestDist = d2;
          bestIdx = i;
        }
      }
    }

    if (bestIdx < 0) return null;
    return {
      idx: bestIdx,
      distSq: bestDist,
      isDeselected: !!(isDeselected && isDeselected[bestIdx]),
    };
  };
})();
