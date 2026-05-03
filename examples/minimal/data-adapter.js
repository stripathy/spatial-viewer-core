/**
 * Minimal example — data adapter.
 *
 * The adapter is the boundary between core (which knows nothing about
 * your data shape) and your viewer's mutable state. See
 * docs/adapter-contract.md for the full contract.
 *
 * This example assumes the simplest possible data layout:
 *   - One color mode: 'subclass'
 *   - Flat shape (subclass_cats + subclass arrays on the sample)
 *   - Color palette under index.json's `subclass_colors`
 *   - No QC, no transcripts, no boundaries
 *
 * If your data is richer (multi-clustering, layer overlay, QC, ...),
 * extend this file rather than core.
 */
function createDemoAdapter(refs) {
  function getCats() {
    const sample = refs.getSampleData();
    return sample ? sample.subclass_cats : [];
  }
  function getIndices() {
    const sample = refs.getSampleData();
    return sample ? sample.subclass : [];
  }
  function getCellTypeName(idx) {
    const cats = getCats();
    const indices = getIndices();
    return (cats && indices) ? cats[indices[idx]] : '?';
  }
  function getPalette() {
    const indexData = refs.getIndexData();
    return (indexData && indexData.subclass_colors) || {};
  }

  // ── Feature contracts ────────────────────────────────────────────────

  function isCellDeselected(idx) {
    if (refs.getColorMode() === 'depth') return false;  // continuous mode
    const name = getCellTypeName(idx);
    return !refs.getActiveTypes().has(name);
  }

  function onCellTypeSearchChange(/* value */) {
    refs.buildCellTypeFilter();
  }

  function onGeneSearchChange(/* value */) {
    // No transcripts in this example.
  }

  function onSoloChange(soloMode, soloType) {
    const cats = getCats();
    if (soloMode && soloType) {
      refs.setActiveTypes(new Set([soloType]));
    } else if (!soloMode) {
      refs.setActiveTypes(new Set(cats));
    }
    refs.precomputeColors();
    refs.buildCellTypeFilter();
    refs.render();
  }

  function getCurrentActiveTypes() {
    return refs.getActiveTypes();
  }

  function applyCellTypeColor(mode, name, color) {
    const indexData = refs.getIndexData();
    if (mode !== 'subclass') return;        // example only has subclass
    indexData.subclass_colors[name] = color;
    refs.precomputeColors();
    refs.buildCellTypeFilter();
    refs.updateLegend();
  }

  function applyGeneColor(/* gene, color */) {
    // No transcripts in this example.
  }

  // ── Tooltip builders ─────────────────────────────────────────────────

  function getCellTooltip(idx) {
    const sample = refs.getSampleData();
    if (!sample) return null;
    const ctName = getCellTypeName(idx);
    const swatch = getPalette()[ctName] || '#666';
    const rows = [
      { label: 'Subclass', value: ctName, swatch },
    ];
    if (sample.predicted_norm_depth) {
      const d = sample.predicted_norm_depth[idx];
      rows.push({ label: 'Depth', value: d.toFixed(3), hint: '(0=top, 1=bottom)' });
    }
    if (sample.transcript_counts) {
      rows.push({ label: 'Counts', value: sample.transcript_counts[idx] });
    }
    return {
      title: sample.cell_ids ? sample.cell_ids[idx] : `#${idx}`,
      sections: [{ rows }],
      position: { x: sample.x[idx], y: sample.y[idx] },
    };
  }

  function getMoleculeTooltip(/* hit */) {
    return null;  // No transcripts in this example.
  }

  return {
    state: {},
    isCellDeselected,
    onCellTypeSearchChange,
    onGeneSearchChange,
    onSoloChange,
    getCurrentActiveTypes,
    applyCellTypeColor,
    applyGeneColor,
    getCellTooltip,
    getMoleculeTooltip,
  };
}

window.createDemoAdapter = createDemoAdapter;
