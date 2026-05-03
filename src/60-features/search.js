/**
 * spatial-viewer-core — search features (cell-type + gene).
 *
 * Both share the same pattern: an <input> filters a list. The
 * `makeSearchFeature` factory produces a feature with that wiring;
 * we export two pre-configured instances for the canonical IDs.
 *
 * State exposed (per feature):
 *   app.state[stateKey]: string  (current filter text, lowercased)
 *
 * Events emitted:
 *   - 'searchChanged'  with payload { stateKey, value }
 *
 * DOM contract:
 *   - <input id="{inputId}">
 *
 * Adapter contract: the `onFilter(app, value)` callback (passed at
 * registration via app.use(makeSearchFeature({ ..., onFilter }))) is
 * how the feature tells the viewer "rebuild your filter list now."
 * Studies typically rebuild a DOM list and may also call setState.
 *
 * Pre-configured features:
 *   - features.cellTypeSearch — wires #celltype-search → state.cellTypeSearchFilter
 *     Adapter must implement: adapter.onCellTypeSearchChange(value)
 *   - features.geneSearch     — wires #gene-search     → state.geneSearchFilter
 *     Adapter must implement: adapter.onGeneSearchChange(value)
 */
(function () {
  'use strict';
  const C = window.SpatialViewerCore;
  C.features = C.features || {};

  /**
   * @param {object} cfg
   * @param {string} cfg.inputId        DOM id of the <input>.
   * @param {string} cfg.stateKey       app.state key the filter writes to.
   * @param {string} cfg.adapterMethod  Method name on app.adapter to invoke
   *                                    on input change. Receives (value: string).
   * @returns {object} feature
   */
  C.makeSearchFeature = function (cfg) {
    const { inputId, stateKey, adapterMethod } = cfg;
    return {
      initialState: { [stateKey]: '' },

      register(app) {
        let inputEl = null;

        // Sync the DOM input to current state (in case the user typed
        // before mounted, or state was cleared programmatically).
        function syncInputToState() {
          if (inputEl && inputEl.value !== app.state[stateKey]) {
            inputEl.value = app.state[stateKey];
          }
        }

        function commit(value) {
          const v = (value || '').toLowerCase();
          if (app.state[stateKey] === v) return;
          app.setState({ [stateKey]: v });
          if (app.adapter[adapterMethod]) app.adapter[adapterMethod](v);
          app.emit('searchChanged', { stateKey, value: v });
        }

        app.on('mounted', () => {
          inputEl = document.getElementById(inputId);
          if (!inputEl) return;
          // If state already has a value (e.g., set by a previous use), reflect it.
          if (app.state[stateKey]) inputEl.value = app.state[stateKey];
          inputEl.oninput = (e) => commit(e.target.value);
          // Esc clears.
          inputEl.onkeydown = (e) => {
            if (e.key === 'Escape') {
              inputEl.value = '';
              commit('');
            }
          };
        });

        // External clears (e.g., solo feature resets the search) propagate
        // to the DOM input.
        app.on('render', syncInputToState);
      },
    };
  };

  C.features.cellTypeSearch = C.makeSearchFeature({
    inputId: 'celltype-search',
    stateKey: 'cellTypeSearchFilter',
    adapterMethod: 'onCellTypeSearchChange',
  });

  C.features.geneSearch = C.makeSearchFeature({
    inputId: 'gene-search',
    stateKey: 'geneSearchFilter',
    adapterMethod: 'onGeneSearchChange',
  });
})();
