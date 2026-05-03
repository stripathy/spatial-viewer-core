/**
 * spatial-viewer-core — color-picker feature.
 *
 * The actual `<input type="color">` swatches live inside study-specific
 * row layouts (the cell-type sidebar list and the legend overlay), so
 * the SWATCH DOM is built by the adapter. This feature contributes the
 * canonical coordination methods that adapter swatches call when the
 * user picks a new color: record the override, mutate the live palette
 * via the adapter, re-render.
 *
 * Also provides convenience event-delegation wiring: if the viewer's
 * sidebar + legend are wrapped in elements with id `celltype-filter`
 * and `legend-overlay`, the feature attaches an `input` listener to
 * each so that any swatch with `data-color-celltype` or `data-color-gene`
 * automatically invokes the right pipeline.
 *
 * App methods added:
 *   app.setCellTypeColor(mode, name, color)
 *     → adapter.applyCellTypeColor(mode, name, color)  + render
 *   app.setGeneColor(gene, color)
 *     → adapter.applyGeneColor(gene, color)            + render
 *
 * Events emitted:
 *   - 'cellTypeColorChanged' { mode, name, color }
 *   - 'geneColorChanged'     { gene, color }
 *
 * Adapter contract:
 *   - adapter.applyCellTypeColor(mode, name, color)  (study-specific
 *     palette mutation + color recompute)
 *   - adapter.applyGeneColor(gene, color)
 *
 * DOM contract (optional event-delegation wiring):
 *   - Containers `#celltype-filter` and `#legend-overlay` exist in viewer HTML
 *   - Swatches inside them carry `data-color-celltype="<name>"` or
 *     `data-color-gene="<gene>"` (adapter is responsible for setting these)
 */
(function () {
  'use strict';
  const C = window.SpatialViewerCore;
  C.features = C.features || {};

  C.features.colorPicker = {
    register(app) {
      app.setCellTypeColor = function (mode, name, color) {
        if (app.adapter.applyCellTypeColor) {
          app.adapter.applyCellTypeColor(mode, name, color);
        }
        app.requestRender();
        app.emit('cellTypeColorChanged', { mode, name, color });
      };

      app.setGeneColor = function (gene, color) {
        if (app.adapter.applyGeneColor) {
          app.adapter.applyGeneColor(gene, color);
        }
        app.requestRender();
        app.emit('geneColorChanged', { gene, color });
      };

      // Event-delegation wiring on the two known containers. We listen on
      // 'input' (live drag) and 'change' (commit) but only act on the first
      // 'input' for a given drag-frame; otherwise we'd double-call adapter.
      app.on('mounted', () => {
        const sidebar = document.getElementById('celltype-filter');
        const legend = document.getElementById('legend-overlay');
        const handler = (e) => {
          const t = e.target;
          if (!t || t.tagName !== 'INPUT' || t.type !== 'color') return;
          const ct = t.getAttribute('data-color-celltype');
          if (ct) {
            // The mode the swatch belongs to: prefer explicit attribute,
            // else fall back to app.state.colorMode (set by the viewer).
            const mode = t.getAttribute('data-color-mode') || app.state.colorMode;
            app.setCellTypeColor(mode, ct, t.value);
            return;
          }
          const gn = t.getAttribute('data-color-gene');
          if (gn) {
            app.setGeneColor(gn, t.value);
            return;
          }
        };
        if (sidebar) sidebar.addEventListener('input', handler);
        if (legend) legend.addEventListener('input', handler);
      });
    },
  };
})();
