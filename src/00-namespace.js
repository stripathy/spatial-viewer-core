/**
 * spatial-viewer-core — namespace bootstrap.
 *
 * Every other src/*.js file in this package attaches its exports to
 * `window.SpatialViewerCore`. This file just creates the namespace if it
 * doesn't already exist, so file-load order in the consuming HTML is
 * forgiving (numbered file prefixes still recommended for clarity).
 */
window.SpatialViewerCore = window.SpatialViewerCore || {};
