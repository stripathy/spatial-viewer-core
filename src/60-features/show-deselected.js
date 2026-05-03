/**
 * spatial-viewer-core — show-deselected feature.
 *
 * Owns the "show deselected cells" toggle: keyboard shortcut, checkbox
 * wiring, and tooltip-decoration. The actual dim render is performed by
 * `drawDimLayer` in the viewer's render() — this feature only owns the
 * STATE of the toggle and the tooltip side-effect.
 *
 * State exposed:
 *   app.state.showDeselectedCells: boolean (default true)
 *
 * Events emitted (none — this feature is a state owner only).
 *
 * Events listened to:
 *   - 'mounted'      — wire the checkbox handler
 *   - 'keydown'      — listen for 'x' to toggle
 *   - 'tooltipReady' — append the dim badge if the hovered cell is deselected
 *
 * DOM contract (must exist in viewer's HTML):
 *   - <input type="checkbox" id="show-deselected-toggle">
 *
 * Adapter contract (viewer's adapter must implement):
 *   - adapter.isCellDeselected(idx) → bool
 */
(function () {
  'use strict';
  const C = window.SpatialViewerCore;
  C.features = C.features || {};

  C.features.showDeselected = {
    initialState: { showDeselectedCells: true },

    register(app) {
      // Keyboard shortcut: 'x' toggles. Mirrors current viewer behavior.
      // Skip when the user is typing in an input/search box.
      app.on('keydown', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
        if (e.key === 'x' || e.key === 'X') {
          app.toggle('showDeselectedCells');
        }
      });

      // Wire the checkbox once the DOM is ready.
      app.on('mounted', () => {
        const cb = document.getElementById('show-deselected-toggle');
        if (!cb) return;
        cb.checked = !!app.state.showDeselectedCells;
        cb.onchange = (e) => app.setState({ showDeselectedCells: e.target.checked });
      });

      // Reflect state changes back to the checkbox (e.g. when 'x' was pressed).
      app.on('render', () => {
        const cb = document.getElementById('show-deselected-toggle');
        if (cb && cb.checked !== !!app.state.showDeselectedCells) {
          cb.checked = !!app.state.showDeselectedCells;
        }
      });

      // Tooltip decorator: when the hovered cell is deselected, add a badge.
      // Payload shape: { fields, kind: 'cell' | 'molecule', idx }
      app.on('tooltipReady', (ev) => {
        if (ev.kind !== 'cell' || ev.idx == null) return;
        if (!app.adapter.isCellDeselected) return;
        if (app.adapter.isCellDeselected(ev.idx)) {
          ev.fields.badge = ev.fields.badge || 'deselected';
        }
      });
    },
  };
})();
