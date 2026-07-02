# geosense-infer

Desktop application for land-cover classification from Sentinel-2 time series.
It runs a trained Random Forest classifier over spectro-temporal features and
renders the result as a georeferenced overlay on an interactive map.

Imagery is read on demand from the Sentinel-2 L2A STAC catalog (Microsoft
Planetary Computer) as Cloud-Optimized GeoTIFFs — only the polygon window and the
four required bands are fetched, so no full product download is required.

The classifier and feature engineering reproduce the method described in:

> Melo, J. L. S., Magalhães, D. K., Kolodziej, J. E., Kuhn, E. V.
> *Automatic Land Cover Classification with Sentinel-2 and MapBiomas Time
> Series.* XLIV Brazilian Symposium on Telecommunications and Signal Processing
> (SBrT 2026), Salvador, BA, Brazil.

![geosense-infer classifying a custom area drawn over José de Freitas, Piauí, Brazil](docs/img/screenshot.jpeg)

## Overview

- Select any area in the world: draw a polygon, search a location, or import a
  KML/GeoJSON file. Three validated study areas from the reference work are
  included as examples.
- Choose an acquisition period and a maximum cloud cover. By default one scene
  per month (lowest cloud cover) is selected.
- Run a single classification (full temporal stack) or a temporal analysis
  (cumulative stacking with per-step soybean retention, when a MapBiomas
  reference is available).
- Inspect the classified map overlay, per-class statistics, and the soybean
  retention curve.

## Download

Prebuilt desktop bundles for macOS, Windows, and Linux are attached to each
[release](https://github.com/rexionmars/geosense/releases).

> **Runtime requirement.** The bundles include the UI and the trained model but
> run inference through a local Python 3.12 with `rasterio`, `scikit-learn`,
> `pyproj`, `shapely`, `joblib`, `numpy`, `pystac-client`, and
> `planetary-computer`. If that interpreter is not on `PATH`, point the app at it
> with the `GEOSENSE_PYTHON` environment variable. See
> [Requirements](#requirements) and [Configuration](#configuration).

## Architecture

```
geosense-infer/
├── main.go              Wails window (frameless, dark), go:embed, bindings
├── app.go               Methods exposed to the frontend
├── backend/
│   ├── sidecar.go       Resolves paths, runs the Python sidecar, streams progress
│   ├── geocode.go       OSM Nominatim location search
│   └── types.go         Request/result types
├── sidecar/
│   └── infer.py         Inference pipeline (STAC discovery, features, RF, overlay)
├── model/               Trained Random Forest artifacts (.joblib)
├── areas/               Embedded example polygons (GeoJSON)
└── frontend/            React 19 + Vite 7 + Tailwind 4 + Leaflet
```

The Go shell renders a native WebView and bridges to a Python sidecar via
subprocess (JSON over stdin/stdout). The sidecar reproduces the notebook
pipeline so inference matches the reference results. Bands are read remotely with
GDAL `/vsicurl`; features are computed in Python; the Random Forest, scaler, and
label encoder are loaded from `model/`.

### Stack

| Layer     | Technology |
|-----------|------------|
| Shell     | Wails v2 (Go) |
| Frontend  | React 19, Vite 7, TypeScript 5.9, Tailwind CSS 4 |
| Map       | Leaflet, react-leaflet 5, leaflet-draw |
| Charts    | Recharts |
| Motion    | Motion (Framer Motion) |
| Inference | Python 3.12, scikit-learn, rasterio, pyproj, shapely, pystac-client, planetary-computer |

## Requirements

- Go 1.23+
- Node.js 18+
- Python 3.12 with the inference dependencies: `rasterio`, `scikit-learn`,
  `pyproj`, `shapely`, `joblib`, `numpy`, `pystac-client`, `planetary-computer`
- For the Prithvi model only: `torch` and `terratorch` (`>=1.2`)
- [Wails CLI](https://wails.io): `go install github.com/wailsapp/wails/v2/cmd/wails@latest`

The Python interpreter is resolved in this order: `GEOSENSE_PYTHON`, a `.venv` at
the repository root, then `python3` on `PATH`.

## Development

```bash
wails dev
```

Starts Vite with hot reload and the Go backend with the bridge bindings.

## Build

```bash
wails build
```

Produces a native application bundle under `build/bin/`.

## Configuration

Path resolution can be overridden with environment variables:

| Variable             | Purpose |
|----------------------|---------|
| `GEOSENSE_PYTHON`    | Python interpreter used to run the sidecar |
| `GEOSENSE_APP_DIR`   | Directory containing `sidecar/`, `areas/`, `model/` |
| `GEOSENSE_MODEL_DIR` | Trained model directory (defaults to `model/`) |

## Models

Two classifiers are selectable in the app.

### Spectral Random Forest (default)

```
rf_classifier.joblib   Random Forest (300 trees)
scaler.joblib          StandardScaler for the 80 features
label_encoder.joblib   MapBiomas class encoder
feature_names.joblib   Ordered feature names (80)
```

Each pixel is described by 80 spectro-temporal features: 14 temporal statistics
for each of NDVI, EVI, and SAVI; 4 statistics per spectral band (B02, B03, B04,
B08); and the raw NDVI series. Reproduces the reference work.

### Prithvi-EO 2.0 embeddings

```
prithvi_rf_pixel.joblib    Random Forest on per-pixel embeddings
prithvi_rf_patch.joblib    Random Forest on per-patch embeddings
prithvi_scaler_{pixel,patch}.joblib
prithvi_label_encoder.joblib
```

Uses the frozen [Prithvi-EO 2.0 300M](https://huggingface.co/ibm-nasa-geospatial/Prithvi-EO-2.0-300M)
geospatial foundation model (NASA/IBM) as an encoder over six Sentinel-2 bands
(B02, B03, B04, B8A, B11, B12), with a Random Forest head trained on its 1024-d
embeddings. Two granularities are available: `pixel` (each pixel encoded
independently, 10 m, comparable to the spectral model) and `patch` (each 16×16
patch encoded with spatial context, ~160 m). The backbone weights (~1.2 GB) are
downloaded from the Hugging Face Hub on first use and cached. This path requires
`terratorch` and `torch`; on Apple Silicon it runs on MPS. Temporal soybean
retention is available only for the spectral model.

To retrain the Prithvi heads, see `sidecar/train_prithvi.py`.

Models must be loaded with a scikit-learn version compatible with the one used
for serialization.

## Data sources

Sentinel-2 L2A scenes are read from the
[Microsoft Planetary Computer](https://planetarycomputer.microsoft.com/) STAC
catalog. Access is anonymous (URLs are signed automatically). Location search
uses [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org/).

## License

MIT. See [LICENSE](LICENSE).
