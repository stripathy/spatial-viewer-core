# Adapter contract

A `spatial-viewer-core`-based viewer is built around a small **adapter**
that you write. The adapter is a plain JavaScript object that knows
your dataset's shape; core's features call into it without ever
touching your data directly.

This document is the formal contract: every method core may call, what
it receives, what it must return.

## Anatomy

```js
function createMyAdapter(refs) {
  return {
    // (1) Feature contracts — called by core features
    isCellDeselected(idx)        { ... },
    onCellTypeSearchChange(value){ ... },
    onGeneSearchChange(value)    { ... },
    onSoloChange(soloMode, type) { ... },
    getCurrentActiveTypes()      { ... },
    applyCellTypeColor(mode, name, color) { ... },
    applyGeneColor(gene, color)  { ... },

    // (2) Tooltip builders — called by your viewer's handleHover
    getCellTooltip(idx, ctx)     { ... },
    getMoleculeTooltip(hit)      { ... },

    // (3) Free-form scratch state
    state: {},
  };
}
```

You typically construct it once at startup with a `refs` bag of
getters/setters that point at your viewer's module-scope mutable state:

```js
const adapter = createMyAdapter({
  getSampleData: () => sampleData,
  getColorMode: () => colorMode,
  getActiveTypes: () => activeTypes,
  setActiveTypes: (s) => { activeTypes = s; },
  // ...etc
});
```

This pattern keeps the adapter testable (no globals) while letting it
read the latest state on every call.

## (1) Feature-facing methods

These are called by `SpatialViewerCore.features.*` when the user
interacts. The feature is the consumer; you provide the data.

### `isCellDeselected(idx) → boolean`

**Called by:** `features.showDeselected` (tooltipReady decorator)

**When:** Right before a tooltip renders, to decide whether to add the
"deselected" pill badge.

**Returns:** `true` if cell `idx` is currently filtered out (i.e., not
in `activeTypes`), `false` otherwise.

**Notes:** Only meaningful in categorical color modes. Continuous modes
(depth, counts) usually return `false` for all cells.

---

### `onCellTypeSearchChange(value: string)`

**Called by:** `features.cellTypeSearch`

**When:** User types in `#celltype-search`, presses Esc, or changes via
`app.setState({ cellTypeSearchFilter: ... })`.

**Receives:** Lowercased filter string (already trimmed of case).

**Should:** Rebuild the cell-type filter list (call your viewer's
`buildCellTypeFilter()` or equivalent). Do **not** re-render the
canvas — search is a sidebar-only operation.

---

### `onGeneSearchChange(value: string)`

**Called by:** `features.geneSearch`

**When:** User types in `#gene-search`.

**Receives:** Lowercased filter string.

**Should:** Rebuild the gene-list sidebar (call your viewer's
`buildGeneList(value)` or equivalent).

---

### `onSoloChange(soloMode: boolean, soloType: string|null)`

**Called by:** `features.solo`

**When:** User clicks `#solo-btn`, calls `app.enterSolo(name)` from a
row click, or `app.exitSolo()`.

**Receives:**
- `soloMode === true && soloType === <name>` — solo entered with target
- `soloMode === true && soloType === null` — solo entered, awaiting a
  type pick (when no single type was active at toggle time)
- `soloMode === false && soloType === null` — solo exited; restore "All"

**Should:**
- When entering with a target: set `activeTypes = new Set([soloType])`
- When exiting: set `activeTypes = new Set(allCategoryNames)`
- When entering without a target: leave `activeTypes` alone (the
  feature renders a "click a type" hint banner)
- Recompute colors, rebuild filter list, re-render canvas

---

### `getCurrentActiveTypes() → Set<string>`

**Called by:** `features.solo` (button-click handler)

**When:** User clicks `#solo-btn` to *enter* solo mode. Used to
auto-pick a soloType when exactly one cell type is currently active.

**Returns:** The current set of active cell type names. The feature
checks `set.size === 1` and picks `[...set][0]` as the seed.

---

### `applyCellTypeColor(mode: string, name: string, color: string)`

**Called by:** `features.colorPicker` (via `app.setCellTypeColor`)

**When:** User changes a swatch on a cell-type sidebar row or legend
entry. Color is a 7-char hex like `#ff5e3a`.

**Should:**
1. Record the override (`customCellTypeColors[mode][name] = color`).
2. Mutate the live palette (so subsequent `getColor(name)` returns the
   new value). The palette key convention is study-specific.
3. If `mode === currentMode`, recompute the precomputed `_colors` array.
4. Rebuild the cell-type filter list (so its swatches reflect the
   new color).
5. Rebuild the legend (same reason).
6. Do **not** trigger render — the feature does that itself via
   `app.requestRender()`.

---

### `applyGeneColor(gene: string, color: string)`

**Called by:** `features.colorPicker` (via `app.setGeneColor`)

**When:** User changes a gene-color swatch in the sidebar or legend.

**Should:**
1. Record the override (`customGeneColors[gene] = color`).
2. Mutate the live `transcriptGenes[gene].color` (so the next render
   uses it).
3. Rebuild the gene-list (so its swatch reflects the new color when
   the change came from the legend, which is a different element).
4. Rebuild the legend.
5. Do **not** trigger render — the feature does that.

---

## (2) Tooltip builders

These are called by **your** `handleHover` (not by core directly), and
return a structured field-list that
[`renderTooltip`](../src/60-tooltip.js) walks into HTML.

### `getCellTooltip(idx: number, ctx?: object) → fields | null`

**Called by:** Your viewer's `handleHover`, after a cell hit is
detected.

**Receives:**
- `idx` — Cell index (0-based, into the per-sample arrays)
- `ctx` — Hit context: `{ idx, distSq, isDeselected }` from `hitTestCell`

**Returns:** A field-list (see schema below), or `null` to suppress
the tooltip.

```js
{
  title: "cell_42",
  badge: "deselected",          // optional; set by show-deselected feature later
  sections: [
    {
      heading: "QC Details",    // optional
      rows: [
        { label: "Subclass", value: "L4 IT", swatch: "#feb236" },
        { label: "Layer", value: "L4", color: "#3b528b" },
        { label: "Depth", value: "0.512", hint: "(0=pia, 1=WM)" },
        { raw: true, html: "<div>Custom HTML escape hatch</div>" },
      ],
    },
  ],
  position: { x: 1234.5, y: 678.9 },   // optional; renders an "x=, y=" footer
}
```

Row types — see [`60-tooltip.js`](../src/60-tooltip.js) for the
authoritative implementation.

### `getMoleculeTooltip(hit) → fields | null`

**Called by:** Your viewer's `handleHover`, after a molecule hit.

**Receives:** `{ gene, idx, distSq }` from `hitTestMolecule`.

**Returns:** Same field-list shape as above. The viewer typically
colors the title via the gene's color (post-`renderTooltip` regex
replacement; see RSC's viewer.js for the pattern).

---

## (3) The `tooltipReady` event

After your viewer builds the field-list via the adapter, emit
`tooltipReady` so features can decorate it:

```js
const fields = adapter.getCellTooltip(idx, hit);
const ev = { kind: 'cell', idx, hit, fields };
app.emit('tooltipReady', ev);
const html = renderTooltip(ev.fields);   // possibly mutated
```

**Listeners can mutate `ev.fields` in place.** Today only
`features.showDeselected` listens — it adds the `deselected` badge if
the adapter says the cell is filtered out.

For molecule hits, set `ev.kind = 'molecule'` and pass `ev.hit` instead
of `ev.idx`.

---

## App methods you can call

Your adapter / DOM wiring can call these on the app:

| Method | What |
|---|---|
| `app.state.X` | Read any state key (read-only — use setState to write) |
| `app.setState({ ... })` | Merge into state; auto-schedules a render |
| `app.toggle('boolKey')` | Flip a boolean |
| `app.requestRender()` | Schedule a render without changing state |
| `app.enterSolo(typeName)` | Set solo mode + type (calls `onSoloChange`) |
| `app.exitSolo()` | Exit solo mode (calls `onSoloChange(false, null)`) |
| `app.setCellTypeColor(mode, name, color)` | Programmatic color change (calls `applyCellTypeColor`) |
| `app.setGeneColor(gene, color)` | Programmatic gene-color change |
| `app.emit(name, payload)` | Fire a custom event |
| `app.on(name, fn)` / `app.off(name, fn)` | Listen / unlisten |

---

## Events emitted by core features

You can listen to these from the viewer or other features:

| Event | Payload | Emitted by |
|---|---|---|
| `'mounted'` | (none) | App, after `start()` |
| `'render'` | (none) | App, when state changes (microtask-batched) |
| `'keydown'` | `KeyboardEvent` | App; re-emit of document keydown |
| `'tooltipReady'` | `{ kind, idx?, hit?, fields }` | Your viewer (you emit it) |
| `'searchChanged'` | `{ stateKey, value }` | `features.cellTypeSearch`, `features.geneSearch` |
| `'soloEntered'` | `{ type }` | `features.solo` |
| `'soloExited'` | (none) | `features.solo` |
| `'cellTypeColorChanged'` | `{ mode, name, color }` | `features.colorPicker` |
| `'geneColorChanged'` | `{ gene, color }` | `features.colorPicker` |

---

## Reference implementations

The live viewers in this organization are the worked examples:

- **RSC adapter:** [`output/viewer/rsc-data.js`](https://github.com/stripathy/RSC_Xenium/blob/main/output/viewer/rsc-data.js)
  — multi-clustering shape (clusterings dict, cluster_colors palette
  nested by mode), rich tooltips with reference taxonomy badges
- **SCZ adapter:** [`output/viewer/scz-data.js`](https://github.com/stripathy/SCZ_Xenium/blob/main/output/viewer/scz-data.js)
  — flat shape (subclass/supertype/class/layer top-level fields), QC
  detail section gated behind a toggle

Either is a reasonable starting point depending on your data shape.

## See also

- [`data-format.md`](data-format.md) — the JSON files your adapter reads from
- [`../examples/minimal/`](../examples/minimal/) — minimal worked example with synthetic data
