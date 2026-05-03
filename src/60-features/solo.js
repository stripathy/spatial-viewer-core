/**
 * spatial-viewer-core — solo-mode feature.
 *
 * Owns the solo toggle: only one cell type is active. The actual
 * activeTypes mutation lives in the adapter (which knows the cluster
 * shape); this feature owns the toggle STATE and the button wiring.
 *
 * State exposed:
 *   app.state.soloMode: boolean (default false)
 *   app.state.soloType: string | null (default null)
 *
 * App methods added (so adapter row-click handlers can call them):
 *   app.enterSolo(typeName)        — sets soloMode=true, soloType=typeName
 *   app.exitSolo()                 — sets soloMode=false, soloType=null
 *
 * Events emitted:
 *   - 'soloEntered' { type }
 *   - 'soloExited'
 *
 * Events listened to:
 *   - 'mounted'         — wire the #solo-btn click + reflect state on the button
 *   - 'render'          — sync `solo-active` class on #solo-btn
 *
 * DOM contract:
 *   - <button id="solo-btn">
 *
 * Adapter contract:
 *   - adapter.onSoloChange(soloMode, soloType): rebuild activeTypes + re-render
 *   - adapter.getCurrentActiveTypes(): Set of currently active type names
 *     (used to auto-pick soloType when exactly one is active at toggle time)
 */
(function () {
  'use strict';
  const C = window.SpatialViewerCore;
  C.features = C.features || {};

  C.features.solo = {
    initialState: { soloMode: false, soloType: null },

    register(app) {
      // App methods — the adapter's per-row click handler calls these.
      app.enterSolo = function (typeName) {
        app.setState({ soloMode: true, soloType: typeName });
        if (app.adapter.onSoloChange) app.adapter.onSoloChange(true, typeName);
        app.emit('soloEntered', { type: typeName });
      };

      app.exitSolo = function () {
        if (!app.state.soloMode) return;
        app.setState({ soloMode: false, soloType: null });
        if (app.adapter.onSoloChange) app.adapter.onSoloChange(false, null);
        app.emit('soloExited');
      };

      // #solo-btn click toggles solo mode. If entering and exactly one
      // type is currently active, lock that as the soloType; otherwise
      // soloType stays null until the user clicks a row.
      app.on('mounted', () => {
        const btn = document.getElementById('solo-btn');
        if (!btn) return;
        btn.classList.toggle('solo-active', !!app.state.soloMode);
        btn.onclick = () => {
          if (app.state.soloMode) {
            app.exitSolo();
          } else {
            const active = app.adapter.getCurrentActiveTypes
              ? app.adapter.getCurrentActiveTypes()
              : null;
            const seed = (active && active.size === 1) ? [...active][0] : null;
            app.enterSolo(seed);
          }
        };
      });

      // Reflect state changes back to the button (e.g., when exitSolo is
      // called externally by adapter / select-all / select-none).
      app.on('render', () => {
        const btn = document.getElementById('solo-btn');
        if (btn) btn.classList.toggle('solo-active', !!app.state.soloMode);
      });
    },
  };
})();
