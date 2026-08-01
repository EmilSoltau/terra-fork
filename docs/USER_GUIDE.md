# User guide

End-to-end workflow for classifying land cover with TERRA. For install details,
see [INSTALL.md](INSTALL.md). For common failures, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## Prerequisites

- A TERRA desktop build ([releases](https://github.com/rexionmars/TERRA/releases))
  **or** a from-source install (`wails dev` / `wails build`).
- Python 3.12 with [`requirements.txt`](../requirements.txt) installed, and
  `GEOSENSE_PYTHON` set if the interpreter is not on `PATH`.
- Network access to the Microsoft Planetary Computer STAC catalog (and Hugging
  Face if you use Prithvi).

## 1. Open the map workspace

On launch, TERRA shows a short boot/splash screen while it probes the Python
sidecar, then reveals the map. The main controls are:

- **Area** — embedded study areas A/B/C, draw, search, or import
- **Period** — start/end dates and max cloud cover
- **Model** — spectral Random Forest, Temporal Transformer, or Prithvi
- **Classify** — run inference
- Optional **data cube** preview before classifying

## 2. Choose an area of interest (AOI)

Pick one of:

| Method | When to use |
|--------|-------------|
| Areas **A / B / C** | Validated polygons from the SBrT 2026 reference work (fastest first run) |
| **Draw** | Digitize a polygon on the map |
| **Search** | Nominatim place search, then draw or refine |
| **Import** | Load a KML or GeoJSON polygon |

Keep AOIs modest for the first run (farm / field scale). Very large polygons
increase STAC I/O and classification time, especially with Prithvi in pixel mode.

## 3. Set the acquisition window

1. Choose **start** and **end** dates (`YYYY-MM-DD`).
2. Set **max cloud cover** (percent).
3. Leave **monthly best** enabled unless you need every qualifying scene
   (monthly best keeps the lowest-cloud scene per month).

## 4. Preview the data cube (optional)

Open the data-cube inventory to list Sentinel-2 L2A scenes that match the AOI
and filters (date, cloud, optional MGRS tiles). Use this to confirm that enough
scenes exist before Classify. Zero scenes usually means a tighter cloud filter
or a period with no coverage — see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## 5. Select a model and mode

| Model | Notes |
|-------|--------|
| **Spectral Random Forest** (default) | 80 spectro-temporal features; matches the reference method; supports **temporal** soybean-retention mode |
| **Temporal Transformer** | Series model over the Sentinel-2 stack (`tt_mapbiomas.pt`) |
| **Prithvi-EO 2.0** | Foundation-model embeddings + RF head; needs `requirements-prithvi.txt`; first run downloads ~1.2 GB from Hugging Face |

Mode:

- **Single / map** — one classification over the full selected stack
- **Temporal** — cumulative stacks with soybean retention (spectral RF only)

## 6. Classify

Click **Classify**. Progress messages stream from the sidecar. When finished,
TERRA opens the Analysis view with:

- Prediction overlay and confidence layer
- Optional MapBiomas reference (Brazil AOIs / embedded areas when available)
- Class statistics (pixels, %, hectares)
- Vegetation-index series and phenology metrics when enough dates exist
- Export of the classification GeoTIFF via the native save dialog

Runs are saved locally (guest user if you are not signed in) so you can reopen
them later.

## 7. Compare two analyses

From saved runs, open **Compare**, pick two analyses, and inspect prediction /
confidence side by side, plus class distribution and phenology / NDVI when both
runs provide them. This is useful for RF vs Temporal Transformer on the same AOI.

## 8. Accounts and preferences (optional)

Local accounts (email/password) store preferences and tie saved runs to a
profile. Avatars and display names are optional. Everything stays on disk under
the app config directory (e.g. `~/Library/Application Support/geosense-infer/`
on macOS); there is no cloud sync.

## Suggested first run

1. Select embedded area **A**.
2. Use a one-year agricultural window with monthly best and a moderate cloud
   threshold (e.g. 30%).
3. Model: **spectral**, mode: single.
4. Classify, then inspect overlays and class stats.
5. Optionally run Temporal Transformer on the same AOI and **Compare**.
