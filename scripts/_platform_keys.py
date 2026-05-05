"""
Platform-specific column-name and file-name mappings for spatial
transcriptomics output bundles.

Vendored from segger (https://github.com/EliHei2/segger_dev) under MIT.
Original: src/segger/data/constants.py.

We adopt segger's schema rather than reinvent it because:
  - The Xenium / MERSCOPE field-name differences are non-trivial and
    well-validated against real datasets in segger.
  - Adding a new platform later means adding one more `Keys` class +
    a filter, exactly as segger did.

We do NOT depend on segger as a runtime package — the segmentation
pipeline (PyG, Dask, Lightning) is unrelated to converting bundles to
JSON. Only the constants are pulled in.

Original copyright:
    Copyright (c) 2024 Elyas Heidari (segger_dev) — MIT License.
"""
from enum import Enum, auto


class SpatialTranscriptomicsKeys(Enum):
    """Abstract keys reconciling field names across Xenium / MERSCOPE / etc."""

    # Files and directories
    TRANSCRIPTS_FILE = auto()
    BOUNDARIES_FILE = auto()
    CELL_METADATA_FILE = auto()

    # Cell identifiers
    CELL_ID = auto()
    TRANSCRIPTS_ID = auto()

    # Coordinates and locations
    TRANSCRIPTS_X = auto()
    TRANSCRIPTS_Y = auto()
    BOUNDARIES_VERTEX_X = auto()
    BOUNDARIES_VERTEX_Y = auto()
    GLOBAL_X = auto()
    GLOBAL_Y = auto()

    # Metadata
    METADATA_CELL_KEY = auto()
    COUNTS_CELL_KEY = auto()
    CELL_X = auto()
    CELL_Y = auto()
    FEATURE_NAME = auto()
    QUALITY_VALUE = auto()
    OVERLAPS_BOUNDARY = auto()


class XeniumKeys(Enum):
    """10x Genomics Xenium output bundle field names."""

    TRANSCRIPTS_FILE = "transcripts.parquet"
    BOUNDARIES_FILE = "cell_boundaries.parquet"
    NUCLEUS_BOUNDARIES_FILE = "nucleus_boundaries.parquet"
    CELL_METADATA_FILE = "cells.parquet"

    # Cell identifiers
    CELL_ID = "cell_id"
    TRANSCRIPTS_ID = "transcript_id"

    # Coordinates and locations
    TRANSCRIPTS_X = "x_location"
    TRANSCRIPTS_Y = "y_location"
    BOUNDARIES_VERTEX_X = "vertex_x"
    BOUNDARIES_VERTEX_Y = "vertex_y"
    CELL_X = "x_centroid"
    CELL_Y = "y_centroid"

    # Metadata
    FEATURE_NAME = "feature_name"
    QUALITY_VALUE = "qv"
    OVERLAPS_BOUNDARY = "overlaps_nucleus"
    METADATA_CELL_KEY = None
    COUNTS_CELL_KEY = None

    # Auto-clustering output (relative to bundle root). Not in segger;
    # added here because the converter needs them.
    GRAPHCLUST_FILE = "analysis/clustering/gene_expression_graphclust/clusters.csv"
    KMEANS_DIR_PATTERN = "analysis/clustering/gene_expression_kmeans_{k}_clusters/clusters.csv"


class MerscopeKeys(Enum):
    """Vizgen MERSCOPE output bundle field names. Schema present for
    future use; the converter CLI does not yet expose --platform merscope."""

    TRANSCRIPTS_FILE = "detected_transcripts.csv"
    BOUNDARIES_FILE = "cell_boundaries.parquet"
    CELL_METADATA_FILE = "cell_metadata.csv"

    CELL_ID = "EntityID"
    TRANSCRIPTS_ID = "transcript_id"

    TRANSCRIPTS_X = "global_x"
    TRANSCRIPTS_Y = "global_y"
    BOUNDARIES_VERTEX_X = "center_x"
    BOUNDARIES_VERTEX_Y = "center_y"

    FEATURE_NAME = "gene"
    QUALITY_VALUE = None
    OVERLAPS_BOUNDARY = None
    METADATA_CELL_KEY = "EntityID"
    COUNTS_CELL_KEY = "cell"
    CELL_X = "center_x"
    CELL_Y = "center_y"


# Xenium-specific transcript filter list. Vendored from segger's
# XeniumSample.filter_transcripts(). These are codeword/probe types that
# don't represent real gene molecules and should be excluded from
# transcript overlays.
XENIUM_TRANSCRIPT_FILTER_PREFIXES = (
    "NegControlProbe_",
    "antisense_",
    "NegControlCodeword_",
    "BLANK_",
    "DeprecatedCodeword_",
    "UnassignedCodeword_",
)

XENIUM_DEFAULT_MIN_QV = 20.0
"""Default minimum quality-value threshold for Xenium transcripts."""
