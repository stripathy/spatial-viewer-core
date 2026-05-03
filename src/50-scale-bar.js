/**
 * spatial-viewer-core — scale-bar overlay.
 *
 * Param-refactored from the in-viewer `drawScaleBar()` (which read
 * `viewScale`, `logicalWidth`, `logicalHeight` as bare globals). The
 * canonical version takes everything it needs as arguments so it is
 * trivially testable on an offscreen canvas.
 *
 * Attaches to window.SpatialViewerCore (created by 00-namespace.js).
 */
(function () {
  'use strict';
  const C = window.SpatialViewerCore;

  /**
   * Draw a scale bar overlay (dark pill + white tick line + label) into the
   * lower-left of `ctx`.
   *
   * The bar's µm length is auto-snapped to a "nice" 1-2-5×10ⁿ value so the
   * pixel width hovers around `targetPx`.
   *
   * @param {CanvasRenderingContext2D} ctx The 2D context to draw into.
   * @param {object} opts
   * @param {number} opts.viewScale       Pixels per µm (zoom factor).
   * @param {number} opts.logicalWidth    Canvas logical width  (CSS pixels).
   * @param {number} opts.logicalHeight   Canvas logical height (CSS pixels).
   * @param {number} [opts.padding=20]    Left+bottom inset from canvas edge.
   * @param {number} [opts.statusBarH=30] Height of the viewer's status bar
   *   (the bar sits above this).
   * @param {number} [opts.targetPx=150]  Target on-screen length in pixels;
   *   the bar's µm value snaps to a nice 1/2/5/10×10ⁿ near this size.
   */
  C.drawScaleBar = function (ctx, opts) {
    const padding = opts.padding != null ? opts.padding : 20;
    const statusBarH = opts.statusBarH != null ? opts.statusBarH : 30;
    const targetPx = opts.targetPx != null ? opts.targetPx : 150;
    const { viewScale, logicalHeight } = opts;

    const barY = logicalHeight - statusBarH - 20;
    const barX = padding;

    const targetUm = targetPx / viewScale;
    const pow = Math.pow(10, Math.floor(Math.log10(targetUm)));
    const d = targetUm / pow;
    let niceUm;
    if (d < 1.5) niceUm = pow;
    else if (d < 3.5) niceUm = 2 * pow;
    else if (d < 7.5) niceUm = 5 * pow;
    else niceUm = 10 * pow;
    niceUm = Math.max(1, Math.round(niceUm));

    const barPx = niceUm * viewScale;
    const label = niceUm >= 1000 ? `${niceUm / 1000} mm` : `${niceUm} µm`;

    ctx.save();
    ctx.globalAlpha = 0.85;

    const bgPad = 6;
    ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
    const textW = ctx.measureText(label).width;
    const bgW = Math.max(barPx, textW) + bgPad * 2;
    const bgH = 32;
    ctx.fillStyle = 'rgba(13,13,26,0.7)';
    ctx.beginPath();
    ctx.roundRect(barX - bgPad, barY - 22, bgW, bgH, 4);
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(barX, barY);
    ctx.lineTo(barX + barPx, barY);
    ctx.stroke();

    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(barX, barY - 3);
    ctx.lineTo(barX, barY + 3);
    ctx.moveTo(barX + barPx, barY - 3);
    ctx.lineTo(barX + barPx, barY + 3);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, barX + barPx / 2, barY - 5);

    ctx.restore();
  };
})();
