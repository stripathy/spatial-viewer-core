/**
 * spatial-viewer-core — declarative tooltip rendering.
 *
 * Replaces the ~75 lines of `html += '...'` that used to live in each
 * viewer's `handleHover`. Studies provide a small adapter that turns a
 * cell index (or a `{ gene, idx }` molecule hit) into a structured
 * field-list; this function walks the field-list and produces HTML.
 *
 * Field-list schema:
 *   {
 *     title: string,                         // top line (cell ID, gene name, ...)
 *     badge?: string,                        // optional small pill after title
 *     sections: [
 *       {
 *         heading?: string,                  // small caps section header
 *         rows: [
 *           { label, value },                                  // plain "Label: value"
 *           { label, value, swatch: '#hex' },                  // colored square + plain row
 *           { label, value, color: '#hex' },                   // value text colored
 *           { label, value, hint: '(extra)' },                 // small grey suffix
 *           { raw: true, html: '...' },                        // escape hatch — viewer-built HTML
 *         ],
 *       },
 *     ],
 *     position?: { x: number, y: number },   // optional footer "x=, y="
 *   }
 *
 * Returns the HTML string. Caller is responsible for assigning to
 * `tooltipEl.innerHTML` and positioning the element.
 *
 * Attaches to window.SpatialViewerCore (created by 00-namespace.js).
 */
(function () {
  'use strict';
  const C = window.SpatialViewerCore;

  // Lightweight HTML escape for the structured (non-raw) field values.
  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderRow(row) {
    if (row.raw) return row.html || '';
    const label = esc(row.label);
    const value = esc(row.value);
    const hint = row.hint
      ? ` <span style="font-size:10px;color:#666;">${esc(row.hint)}</span>`
      : '';
    if (row.swatch) {
      const sw = esc(row.swatch);
      return `<div><span style="display:inline-block;width:10px;height:10px;background:${sw};border-radius:2px;vertical-align:middle;margin-right:4px;"></span>${label}: ${value}${hint}</div>`;
    }
    if (row.color) {
      const c = esc(row.color);
      return `<div>${label}: <span style="color:${c};font-weight:700;">${value}</span>${hint}</div>`;
    }
    if (!row.label && row.value != null) {
      // Bare value (no "Label:" prefix) — useful for one-liners
      return `<div>${value}${hint}</div>`;
    }
    return `<div>${label}: ${value}${hint}</div>`;
  }

  function renderSection(section, isFirst) {
    let html = '';
    if (!isFirst) {
      html += '<div style="border-top:1px solid #333; margin:4px 0;"></div>';
    }
    if (section.heading) {
      html += `<div style="font-size:10px;color:#e94560;font-weight:600;margin-top:2px;">${esc(section.heading)}</div>`;
    }
    const rows = section.rows || [];
    for (let i = 0; i < rows.length; i++) {
      html += renderRow(rows[i]);
    }
    return html;
  }

  /**
   * @param {object} fields The structured field-list.
   * @returns {string} HTML.
   */
  C.renderTooltip = function (fields) {
    if (!fields) return '';
    let html = '';
    const title = fields.title != null ? esc(fields.title) : '';
    const badge = fields.badge
      ? ` <span style="font-size:9px;color:#aaa;background:rgba(255,255,255,0.08);padding:0 4px;border-radius:3px;">${esc(fields.badge)}</span>`
      : '';
    if (title || badge) {
      html += `<div class="tt-label">${title}${badge}</div>`;
    }
    const sections = fields.sections || [];
    for (let i = 0; i < sections.length; i++) {
      html += renderSection(sections[i], i === 0 && !title && !badge);
    }
    if (fields.position) {
      const px = Number(fields.position.x).toFixed(1);
      const py = Number(fields.position.y).toFixed(1);
      html += `<div style="color:#666;font-size:10px;">x=${px}, y=${py}</div>`;
    }
    return html;
  };
})();
