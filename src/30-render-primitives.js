/**
 * spatial-viewer-core — render primitives.
 *
 * Five drawing functions extracted from the in-viewer `render()`. Each
 * takes a 2D context and an opts bag; viewers are responsible for
 * computing study-specific masks (`passes`, `isDeselected`, qc filters)
 * before calling these.
 *
 * All primitives are pure with respect to canvas state (save/restore +
 * explicit globalAlpha=1 reset on exit) so they can be composed in any
 * order without leaking state to callers.
 *
 * Attaches to window.SpatialViewerCore (created by 00-namespace.js).
 */
(function () {
  'use strict';
  const C = window.SpatialViewerCore;

  // 50-pixel margin used by the boundary/polygon viewport cull. Cells
  // whose centroid is offscreen by more than this can't have any visible
  // polygon vertex, so we skip the whole polygon trace.
  const POLY_CULL_MARGIN = 50;

  /**
   * Trace one polygon (vpc verts at boundaryData[bi*vpc..]) into the
   * current path. Internal helper; caller is responsible for stroke/fill
   * and beginPath() before calling.
   */
  function tracePolygon(ctx, bd, bi, viewScale, viewX, viewY) {
    const vpc = bd.vpc;
    const base = bi * vpc;
    ctx.moveTo(bd.bx[base] * viewScale + viewX, bd.by[base] * viewScale + viewY);
    for (let v = 1; v < vpc; v++) {
      ctx.lineTo(bd.bx[base + v] * viewScale + viewX, bd.by[base + v] * viewScale + viewY);
    }
    ctx.closePath();
  }

  /**
   * Dim-render the cells where `passes[i] === 0` so the user has tissue
   * context (and can hover them with showDeselectedCells on).
   *
   * Mirrors the active-layer rendering pattern: at high zoom (when
   * boundaries are readable), strokes the cell polygons; at low zoom,
   * paints small fillRect dots. Per-rect/per-stroke draws are used over
   * batched Path2D because cold-cache tessellation of a 64K-subpath
   * Path2D can take 4+ seconds on the first click after page load (this
   * was the root cause of the SCZ "first None click freeze" bug).
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} opts
   * @param {Float32Array|number[]} opts.x  Cell centroid X (data coords).
   * @param {Float32Array|number[]} opts.y  Cell centroid Y (data coords).
   * @param {number} opts.n                 Cell count.
   * @param {Uint8Array} opts.passes        Per-cell mask (0=dim, 1=skip).
   * @param {Uint8Array} [opts.qcMask]      Optional: skip cells where qcMask[i]>0.
   * @param {number} opts.viewScale         Pixels per µm.
   * @param {number} opts.viewX             View-X translation (px).
   * @param {number} opts.viewY             View-Y translation (px).
   * @param {number} opts.w                 Canvas logical width.
   * @param {number} opts.h                 Canvas logical height.
   * @param {boolean} opts.useBoundaries    True → polygon strokes; false → scatter.
   * @param {object} [opts.boundaryData]    Required when useBoundaries=true.
   * @param {Int32Array} [opts.bMap]        Cell→boundary index map (or null=identity).
   * @param {number} opts.r                 Scatter dot size (when !useBoundaries).
   * @returns {{ shown: number }}
   */
  C.drawDimLayer = function (ctx, opts) {
    const { x, y, n, passes, viewScale, viewX, viewY, w, h, useBoundaries } = opts;
    const qcMask = opts.qcMask || null;
    let shown = 0;

    if (useBoundaries) {
      const bd = opts.boundaryData;
      const bMap = opts.bMap || null;
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.0;
      for (let i = 0; i < n; i++) {
        if (passes[i]) continue;
        if (qcMask && qcMask[i] > 0) continue;
        const cx = x[i] * viewScale + viewX;
        const cy = y[i] * viewScale + viewY;
        if (cx < -POLY_CULL_MARGIN || cx > w + POLY_CULL_MARGIN
            || cy < -POLY_CULL_MARGIN || cy > h + POLY_CULL_MARGIN) continue;
        const bi = bMap ? bMap[i] : i;
        if (bi < 0 || bi >= bd.n) continue;
        ctx.beginPath();
        tracePolygon(ctx, bd, bi, viewScale, viewX, viewY);
        ctx.stroke();
        shown++;
      }
      ctx.restore();
    } else {
      const r = opts.r;
      ctx.save();
      ctx.globalAlpha = 0.30;
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < n; i++) {
        if (passes[i]) continue;
        if (qcMask && qcMask[i] > 0) continue;
        const sx = x[i] * viewScale + viewX;
        const sy = y[i] * viewScale + viewY;
        if (sx < -r || sx > w + r || sy < -r || sy > h + r) continue;
        ctx.fillRect(sx - r / 2, sy - r / 2, r, r);
        shown++;
      }
      ctx.restore();
    }
    return { shown };
  };

  /**
   * Render active cells as filled boundary polygons (with point fallback
   * for cells lacking a polygon). Optionally adds a nucleus stroke pass
   * over the same set of cells.
   *
   * Cells are bucketed by color so the (expensive) `fillStyle` setter
   * fires once per unique color, not once per cell.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} opts
   * @param {Float32Array|number[]} opts.x
   * @param {Float32Array|number[]} opts.y
   * @param {string[]} opts.colors          Per-cell #hex.
   * @param {number} opts.n
   * @param {Uint8Array} opts.passes        1=draw, 0=skip.
   * @param {Uint8Array} [opts.qcMask]
   * @param {number} opts.viewScale
   * @param {number} opts.viewX
   * @param {number} opts.viewY
   * @param {number} opts.w
   * @param {number} opts.h
   * @param {object} opts.boundaryData      `{ n, vpc, bx, by }`.
   * @param {Int32Array} [opts.bMap]
   * @param {number} opts.r                 Fallback dot size.
   * @param {number} opts.alpha             globalAlpha for the fill pass.
   * @param {object} [opts.nucleusData]     If set, nucleus stroke pass runs.
   * @param {number} [opts.nucleusAlpha]    globalAlpha for nucleus pass (default alpha*0.8).
   * @returns {{ shown: number }}
   */
  C.drawBoundaryLayer = function (ctx, opts) {
    const { x, y, colors, n, passes, viewScale, viewX, viewY, w, h, boundaryData, r, alpha } = opts;
    const qcMask = opts.qcMask || null;
    const bMap = opts.bMap || null;
    const bd = boundaryData;
    let shown = 0;

    // Bucket cells by color: cells with a polygon → colorPolygons[c] = [bi, ...]
    // Cells lacking a polygon → colorPoints[c] = [px, py, px, py, ...]
    const colorPolygons = {};
    const colorPoints = {};
    for (let i = 0; i < n; i++) {
      if (!passes[i]) continue;
      if (qcMask && qcMask[i] > 0) continue;
      const cx = x[i] * viewScale + viewX;
      const cy = y[i] * viewScale + viewY;
      if (cx < -POLY_CULL_MARGIN || cx > w + POLY_CULL_MARGIN
          || cy < -POLY_CULL_MARGIN || cy > h + POLY_CULL_MARGIN) continue;
      const c = colors[i];
      const bi = bMap ? bMap[i] : i;
      if (bi >= 0 && bi < bd.n) {
        if (!colorPolygons[c]) colorPolygons[c] = [];
        colorPolygons[c].push(bi);
      } else {
        if (!colorPoints[c]) colorPoints[c] = [];
        colorPoints[c].push(cx, cy);
      }
      shown++;
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    for (const color in colorPolygons) {
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.5;
      const bis = colorPolygons[color];
      for (let k = 0; k < bis.length; k++) {
        ctx.beginPath();
        tracePolygon(ctx, bd, bis[k], viewScale, viewX, viewY);
        ctx.fill();
        ctx.stroke();
      }
    }
    for (const color in colorPoints) {
      ctx.fillStyle = color;
      const pts = colorPoints[color];
      for (let j = 0; j < pts.length; j += 2) {
        ctx.fillRect(pts[j] - r / 2, pts[j + 1] - r / 2, r, r);
      }
    }
    ctx.restore();

    // Optional nucleus stroke pass — uses the same bMap (in practice both
    // viewers use one shared cell→boundary index for nucleus + cell).
    if (opts.nucleusData) {
      const nd = opts.nucleusData;
      const nucleusAlpha = opts.nucleusAlpha != null ? opts.nucleusAlpha : alpha * 0.8;
      ctx.save();
      ctx.globalAlpha = nucleusAlpha;
      ctx.lineWidth = 1.0;
      for (const color in colorPolygons) {
        ctx.strokeStyle = color;
        const bis = colorPolygons[color];
        for (let k = 0; k < bis.length; k++) {
          const bi = bis[k];
          if (bi >= nd.n) continue;
          ctx.beginPath();
          tracePolygon(ctx, nd, bi, viewScale, viewX, viewY);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    return { shown };
  };

  /**
   * Render active cells as point centroids (no fill polygon) plus a
   * nucleus stroke pass. This is the third render branch from the original
   * viewers — used when boundaries are off but the user has nucleus
   * outlines on at high zoom.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} opts                   Same shape as drawBoundaryLayer
   *   but `nucleusData` is required and `boundaryData` is unused.
   * @returns {{ shown: number }}
   */
  C.drawNucleusOnlyLayer = function (ctx, opts) {
    const { x, y, colors, n, passes, viewScale, viewX, viewY, w, h, nucleusData, r, alpha } = opts;
    const qcMask = opts.qcMask || null;
    const bMap = opts.bMap || null;
    const nd = nucleusData;
    let shown = 0;

    const colorPolygons = {};
    const colorPoints = {};
    for (let i = 0; i < n; i++) {
      if (!passes[i]) continue;
      if (qcMask && qcMask[i] > 0) continue;
      const cx = x[i] * viewScale + viewX;
      const cy = y[i] * viewScale + viewY;
      if (cx < -POLY_CULL_MARGIN || cx > w + POLY_CULL_MARGIN
          || cy < -POLY_CULL_MARGIN || cy > h + POLY_CULL_MARGIN) continue;
      const c = colors[i];
      const bi = bMap ? bMap[i] : i;
      if (bi >= 0 && bi < nd.n) {
        if (!colorPolygons[c]) colorPolygons[c] = [];
        colorPolygons[c].push({ ci: i, bi });
      } else {
        if (!colorPoints[c]) colorPoints[c] = [];
        colorPoints[c].push(cx, cy);
      }
      shown++;
    }

    ctx.save();
    ctx.globalAlpha = alpha * 0.8;
    ctx.lineWidth = 1.0;

    // Centroid dots first — for every visible cell.
    for (const color in colorPolygons) {
      ctx.fillStyle = color;
      const items = colorPolygons[color];
      for (let k = 0; k < items.length; k++) {
        const ci = items[k].ci;
        const sx = x[ci] * viewScale + viewX;
        const sy = y[ci] * viewScale + viewY;
        ctx.fillRect(sx - r / 2, sy - r / 2, r, r);
      }
    }
    for (const color in colorPoints) {
      ctx.fillStyle = color;
      const pts = colorPoints[color];
      for (let j = 0; j < pts.length; j += 2) {
        ctx.fillRect(pts[j] - r / 2, pts[j + 1] - r / 2, r, r);
      }
    }
    // Nucleus outlines on top.
    for (const color in colorPolygons) {
      ctx.strokeStyle = color;
      const items = colorPolygons[color];
      for (let k = 0; k < items.length; k++) {
        ctx.beginPath();
        tracePolygon(ctx, nd, items[k].bi, viewScale, viewX, viewY);
        ctx.stroke();
      }
    }
    ctx.restore();
    return { shown };
  };

  /**
   * Render active cells as colored point centroids (the fastest path —
   * used when neither boundaries nor nucleus outlines apply).
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} opts
   * @param {Float32Array|number[]} opts.x
   * @param {Float32Array|number[]} opts.y
   * @param {string[]} opts.colors
   * @param {number} opts.n
   * @param {Uint8Array} opts.passes
   * @param {Uint8Array} [opts.qcMask]
   * @param {number} opts.viewScale
   * @param {number} opts.viewX
   * @param {number} opts.viewY
   * @param {number} opts.w
   * @param {number} opts.h
   * @param {number} opts.r
   * @param {number} opts.alpha
   * @returns {{ shown: number }}
   */
  C.drawScatterLayer = function (ctx, opts) {
    const { x, y, colors, n, passes, viewScale, viewX, viewY, w, h, r, alpha } = opts;
    const qcMask = opts.qcMask || null;
    let shown = 0;

    const buckets = {};
    for (let i = 0; i < n; i++) {
      if (!passes[i]) continue;
      if (qcMask && qcMask[i] > 0) continue;
      const sx = x[i] * viewScale + viewX;
      const sy = y[i] * viewScale + viewY;
      if (sx < -r || sx > w + r || sy < -r || sy > h + r) continue;
      const c = colors[i];
      if (!buckets[c]) buckets[c] = [];
      buckets[c].push(sx, sy);
      shown++;
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    for (const color in buckets) {
      ctx.fillStyle = color;
      const pts = buckets[color];
      for (let j = 0; j < pts.length; j += 2) {
        ctx.fillRect(pts[j] - r / 2, pts[j + 1] - r / 2, r, r);
      }
    }
    ctx.restore();
    return { shown };
  };

  /**
   * Overlay transcript-molecule dots on top of the cell layer. Each
   * gene's molecules use that gene's pre-assigned color.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} opts
   * @param {object} opts.transcriptGenes   Map: gene → { x, y, n, color }.
   * @param {Iterable<string>} opts.activeGenes
   * @param {number} opts.viewScale
   * @param {number} opts.viewX
   * @param {number} opts.viewY
   * @param {number} opts.w
   * @param {number} opts.h
   * @param {number} opts.moleculeSize
   * @param {number} opts.moleculeOpacity
   * @param {number} opts.zoomRatio         viewScale / baseScale, used for mr scaling.
   * @returns {{ shown: number }}
   */
  C.drawTranscriptOverlay = function (ctx, opts) {
    const { transcriptGenes, activeGenes, viewScale, viewX, viewY, w, h,
            moleculeSize, moleculeOpacity, zoomRatio } = opts;
    let shown = 0;
    const mr = moleculeSize * Math.max(0.5, Math.sqrt(zoomRatio) * 0.5);

    ctx.save();
    ctx.globalAlpha = moleculeOpacity;
    for (const gene of activeGenes) {
      const gd = transcriptGenes[gene];
      if (!gd) continue;
      ctx.fillStyle = gd.color;
      const gx = gd.x, gy = gd.y, gn = gd.n;
      for (let i = 0; i < gn; i++) {
        const sx = gx[i] * viewScale + viewX;
        const sy = gy[i] * viewScale + viewY;
        if (sx < -mr || sx > w + mr || sy < -mr || sy > h + mr) continue;
        ctx.fillRect(sx - mr / 2, sy - mr / 2, mr, mr);
        shown++;
      }
    }
    ctx.restore();
    return { shown };
  };
})();
