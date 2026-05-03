# spatial-viewer-core

Vanilla-JS rendering and interaction primitives for browser-based viewers
of image-based spatial transcriptomics data (10x Xenium, MERFISH, CosMx,
similar platforms).

This is the shared core used by:

- [RSC_Xenium](https://github.com/stripathy/RSC_Xenium) — human retrosplenial cortex Xenium viewer ([live](https://rsc-xenium.netlify.app))
- [SCZ_Xenium](https://github.com/stripathy/SCZ_Xenium) — human DLPFC schizophrenia Xenium viewer ([live](https://sczxenium.netlify.app))

## What it provides

The viewer competence this core is built around:

- **Cell-level annotations** — colored points or polygons per cell, by cell-type label or continuous value
- **Cell + nucleus boundary polygons** — segmentation outlines, drawn at zoom thresholds
- **Per-molecule transcript locations** — overlay individual mRNA molecules colored by gene
- **Cell tooltips** — rich hover info per cell
- **Show-deselected layer** — dim "ghost" of filtered-out cells, with hover-on-deselected
- **Per-type color customization** — sidebar + legend swatches as native color pickers

It does **not** support sequencing-based spatial transcriptomics (Visium, Slide-seq) — those use bins/spots rather than segmented cells, and need different rendering primitives.

## What's NOT in core

Each downstream viewer keeps the **study-specific** parts in its own repo:
- Data adapter (which clusterings exist, what tooltip fields show, what color modes are exposed)
- Pipeline + preprocessing
- Tooltip content beyond the basics
- Any study-specific rendering overlays (e.g. cortical-layer grid, BANKSY domain shading)

## Architecture

- **No build step.** Pure ES5/ES6 in classic-script files. No transpiler, no bundler, no `node_modules` for users.
- **Namespace-scoped.** All exports live on `window.SpatialViewerCore`. Each src file is an IIFE that attaches its piece.
- **Numbered files** (`00-`, `10-`, …) so HTML script-tag order is naturally correct without dependency resolution.
- **Sync-script integration.** Downstream viewers `make sync-core` to copy `src/` into their `output/viewer/core/`. No git submodule.

## Files

```
src/
  00-namespace.js               # creates window.SpatialViewerCore
  10-utils.js                   # normalizeHex, safeIntCmp
  20-boundary.js                # decodeBoundaryJson, buildCellToBoundaryMap
  30-render-primitives.js       # scatter/polygon/dim/transcript drawing  (Tier 3b)
  40-hover.js                   # point-in-polygon hit-test               (Tier 3b)
  50-scale-bar.js               # drawScaleBar
  60-features/                  # opt-in plugin features                  (Tier 3c)
  70-app.js                     # mini App framework                      (Tier 3c)
```

(Files marked Tier 3b/3c land in subsequent releases.)

## Using it

In your viewer's `output/viewer/index.html`, before your `viewer.js`:

```html
<script src="core/00-namespace.js" defer></script>
<script src="core/10-utils.js" defer></script>
<script src="core/20-boundary.js" defer></script>
<script src="core/50-scale-bar.js" defer></script>
<!-- ...later as Tier 3b/3c files are added... -->
<script src="viewer.js" defer></script>
```

In your `viewer.js`:

```js
const { normalizeHex, safeIntCmp } = SpatialViewerCore;
// or call as SpatialViewerCore.normalizeHex(...) directly
```

## Sync workflow (for downstream viewers)

In your viewer repo's `Makefile`:

```makefile
CORE_REPO ?= ~/Github/spatial-viewer-core
CORE_DIR  := output/viewer/core

sync-core:
	@cd $(CORE_REPO) && git pull --ff-only
	mkdir -p $(CORE_DIR)
	rsync -av --delete --exclude='.git' --exclude='tests' --exclude='examples' \
	  --exclude='node_modules' --exclude='package*.json' --exclude='*.config.js' \
	  $(CORE_REPO)/src/ $(CORE_DIR)/
	@cd $(CORE_REPO) && git rev-parse --short HEAD > $(PWD)/$(CORE_DIR)/VERSION
```

Day-to-day:
```bash
cd your-viewer-repo
make sync-core           # rsyncs latest core/ in
make test                # Playwright must stay green
git add output/viewer/core
git commit -m "Bump core to abc123"
make deploy
```

## Testing

```bash
npm install
npx playwright test
```

Tests live in `tests/`. Each `src/` module has corresponding tests covering pure-function input/output, with a synthetic offscreen canvas where rendering is involved.

## Releases

Tagged versions on `main`. Downstream viewers commit a synced copy of `src/`, so each viewer pins to whichever version it last synced. The `core/VERSION` file in the viewer records the short commit hash.

## License

MIT — see `LICENSE`.

## Contributing

Issues + PRs welcome. The viewer is shaped by a specific set of use cases (RSC, SCZ DLPFC, similar Xenium studies); proposals that fit the architecture are merged readily, larger changes warrant discussion first.
