/**
 * spatial-viewer-core — App framework.
 *
 * The App is a tiny state + event hub that features register against.
 * Studies provide an `adapter` (factory-built plain object) that knows
 * the data shape; features know nothing about the data — they read/write
 * `app.state` and emit/listen to events.
 *
 * Lifecycle:
 *   1. const app = SpatialViewerCore.createApp({ adapter, initialState? })
 *   2. app.use(SpatialViewerCore.features.X)  (chainable)  — features
 *      register their event listeners + UI injectors here.
 *   3. app.start()  — fires 'mounted', then the first 'render' tick.
 *
 * State updates:
 *   - app.setState({ key: value, ... }) merges into app.state, marks the
 *     app dirty, and schedules ONE 'render' emission per microtask.
 *     Multiple setState calls in the same tick coalesce.
 *   - Use app.toggle('booleanKey') as shorthand for boolean flips.
 *
 * Events (listen via app.on(name, fn); emit via app.emit(name, payload)):
 *   - 'mounted'        — fired once after start()
 *   - 'render'         — fired (batched) after any setState or requestRender
 *   - 'keydown'        — re-emit of document keydown events (handlers
 *                        installed in start())
 *   - 'tooltipReady'   — fired by viewer's hover handler before rendering
 *                        the tooltip; payload is the field-list, mutable
 *                        by listeners (e.g., show-deselected adds a badge)
 *
 * Attaches to window.SpatialViewerCore (created by 00-namespace.js).
 */
(function () {
  'use strict';
  const C = window.SpatialViewerCore;

  /**
   * @param {object} opts
   * @param {object} opts.adapter        Study-specific data adapter (plain object).
   * @param {object} [opts.initialState] Initial app.state contents.
   * @returns {object} app
   */
  C.createApp = function (opts) {
    const adapter = opts.adapter;
    const state = Object.assign({}, opts.initialState || {});
    const features = [];
    const listeners = {};   // event name → array of handler fns
    let mounted = false;
    let renderQueued = false;
    let keydownHandler = null;

    function on(event, fn) {
      (listeners[event] || (listeners[event] = [])).push(fn);
      return app;
    }

    function off(event, fn) {
      const arr = listeners[event];
      if (!arr) return app;
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
      return app;
    }

    function emit(event, payload) {
      const arr = listeners[event];
      if (!arr) return;
      // Snapshot so listeners can off() during dispatch without mutating mid-iter.
      const snapshot = arr.slice();
      for (let i = 0; i < snapshot.length; i++) {
        snapshot[i](payload);
      }
    }

    function setState(patch) {
      let changed = false;
      for (const k in patch) {
        if (state[k] !== patch[k]) {
          state[k] = patch[k];
          changed = true;
        }
      }
      if (changed) requestRender();
      return app;
    }

    function toggle(key) {
      return setState({ [key]: !state[key] });
    }

    function requestRender() {
      if (renderQueued || !mounted) return;
      renderQueued = true;
      // Microtask batching: multiple setState calls in the same tick
      // coalesce into one render emission.
      Promise.resolve().then(() => {
        renderQueued = false;
        emit('render');
      });
    }

    function use(feature) {
      if (feature.initialState) {
        for (const k in feature.initialState) {
          if (!(k in state)) state[k] = feature.initialState[k];
        }
      }
      feature.register(app);
      features.push(feature);
      return app;
    }

    function start() {
      if (mounted) return app;
      mounted = true;
      keydownHandler = (e) => emit('keydown', e);
      document.addEventListener('keydown', keydownHandler);
      emit('mounted');
      // First render tick (synchronous, not microtask-batched, so the
      // initial paint happens immediately after start() returns).
      emit('render');
      return app;
    }

    function destroy() {
      if (!mounted) return app;
      if (keydownHandler) document.removeEventListener('keydown', keydownHandler);
      keydownHandler = null;
      mounted = false;
      // Clear listeners so a re-start doesn't double-fire.
      for (const k in listeners) listeners[k].length = 0;
      return app;
    }

    const app = {
      adapter, state, features,
      on, off, emit,
      setState, toggle, requestRender,
      use, start, destroy,
    };
    return app;
  };
})();
