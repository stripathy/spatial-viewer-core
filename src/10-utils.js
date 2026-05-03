/**
 * spatial-viewer-core — small pure utilities.
 *
 * Attaches to window.SpatialViewerCore (created by 00-namespace.js).
 */
(function () {
  'use strict';
  const C = window.SpatialViewerCore;

  /**
   * Normalize a CSS color literal to a 7-character `#rrggbb` string.
   *
   * Suitable for setting `<input type="color">.value`, which only accepts
   * lowercase 7-char hex.
   *
   * Accepts:
   *   - 4-char hex shorthand (e.g. `#fff` → `#ffffff`)
   *   - 7+-char hex (e.g. `#FF0000` → `#ff0000`, alpha clipped if `#rrggbbaa`)
   *   - named CSS colors (e.g. `rebeccapurple`) and `rgb()/rgba()` —
   *     resolved via an offscreen canvas
   *   - `null`, `undefined`, non-strings, or unparseable values → `'#666666'`
   *
   * @param {*} c CSS color of any supported form (or anything else).
   * @returns {string} 7-char lowercase `#rrggbb` string. Falls back to
   *   `'#666666'` if `c` is missing, not a string, or canvas resolution fails.
   */
  C.normalizeHex = function (c) {
    if (!c || typeof c !== 'string') return '#666666';
    if (c[0] === '#') {
      if (c.length === 4) {
        return ('#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]).toLowerCase();
      }
      if (c.length >= 7) return c.toLowerCase().slice(0, 7);
    }
    // Fallback: let the canvas API resolve named/rgb() to hex.
    try {
      const ctxTmp = document.createElement('canvas').getContext('2d');
      ctxTmp.fillStyle = c;
      return ctxTmp.fillStyle.toLowerCase().slice(0, 7);
    } catch (e) {
      return '#666666';
    }
  };

  /**
   * Compare two strings as integers when both parse to finite ints.
   *
   * Designed for sorting cluster labels like `'Pvalb_2'` and `'Pvalb_10'`
   * numerically (so `_2` precedes `_10`). When either operand does NOT parse
   * to a finite integer, returns `0` so the caller can fall through to a
   * lexicographic tiebreaker (e.g. `safeIntCmp(a, b) || a.localeCompare(b)`).
   *
   * Note: `parseInt` is forgiving — `'Pvalb_2'` parses to `NaN`, but `'2_a'`
   * parses to `2`. Pass already-extracted suffixes if you need stricter
   * behavior.
   *
   * @param {string} a
   * @param {string} b
   * @returns {number} `ai - bi` when both parse, else `0`.
   */
  C.safeIntCmp = function (a, b) {
    const ai = parseInt(a, 10);
    const bi = parseInt(b, 10);
    if (Number.isFinite(ai) && Number.isFinite(bi)) return ai - bi;
    return 0;
  };
})();
