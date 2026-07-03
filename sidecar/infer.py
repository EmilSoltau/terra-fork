#!/usr/bin/env python3
"""
Inference sidecar for geosense-infer.

Reads a JSON request from stdin, runs the trained Random Forest land-cover
classifier over a Sentinel-2 L2A time series clipped to a study-area polygon,
and writes a JSON result to stdout. Progress messages are written to stderr as
one JSON object per line.

The feature engineering, band loading, vegetation indices and georeferencing
logic are reproduced from the project notebooks
(022026/experiments/crop_classification_mapbiomas.ipynb and
ground_truth_temporal_validation.ipynb) to preserve numerical equivalence with
the published results.

Request (stdin, single JSON object):
    {
      "model_dir": "<path to output_mapbiomas/model>",
      "sentinel_dir": "<directory containing *.SAFE products>",
      "tiles": ["T22JBT", "T21JZN"],          # optional tile filter
      "polygon_geojson": {...},                # GeoJSON geometry (Polygon)
      "mapbiomas_path": "<path to mapbiomas_*.tif>",  # optional; enables soja retention
      "mode": "single" | "temporal",          # single: full stack; temporal: cumulative
      "work_dir": "<output directory>"
    }

Result (stdout, single JSON object):
    {
      "extent": {"lon_min":.., "lon_max":.., "lat_min":.., "lat_max":..},
      "overlay_png": "<work_dir>/overlay.png",
      "raster_tif": "<work_dir>/classification_map.tif",
      "n_dates": <int>,
      "date_range": ["YYYY-MM-DD", "YYYY-MM-DD"],
      "class_stats": [{"class_id","name","color","pixels","pct","area_ha"}],
      "temporal": [{"date","n_dates_stack","soja_ndvi_mean","soja_retention_pct","dominant"}]
    }
"""

import sys
import json
from pathlib import Path
from datetime import datetime
import xml.etree.ElementTree as ET

import numpy as np
import rasterio
from rasterio.mask import mask as rio_mask
from rasterio.warp import reproject, Resampling
from rasterio.windows import from_bounds
from shapely.geometry import Polygon, shape
from shapely.ops import transform as shp_transform
from pyproj import Transformer
import joblib

import warnings
warnings.filterwarnings('ignore')

SOJA_CLASS_ID = 39

# Class metadata used for labels and the overlay palette (MapBiomas classes,
# English labels).
MAPBIOMAS_LEGEND = {
    3: 'Forest Formation',
    21: 'Agriculture-Pasture Mosaic',
    25: 'Non-vegetated Area',
    39: 'Soybean',
    41: 'Other Temporary Crops',
}

MAPBIOMAS_COLORS = {
    3: '#006d2c',
    21: '#fee391',
    25: '#d73027',
    39: '#4292c6',
    41: '#9e9ac8',
}


def emit_progress(progress, msg):
    """Write one JSON progress object per line to stderr."""
    sys.stderr.write(json.dumps({'progress': progress, 'msg': msg}) + '\n')
    sys.stderr.flush()


def fail(msg):
    """Write an error to stderr and exit non-zero."""
    sys.stderr.write(json.dumps({'error': msg}) + '\n')
    sys.stderr.flush()
    sys.exit(1)


# --- Polygon / study area --------------------------------------------------

def polygon_from_geojson(geom):
    """Build a shapely Polygon from a GeoJSON geometry dict."""
    return shape(geom)


def parse_kml_coordinates(kml_path, target_name=None):
    """Extract polygon coordinates from a KML file (from the notebooks)."""
    tree = ET.parse(kml_path)
    root = tree.getroot()
    ns = {
        'kml': 'http://www.opengis.net/kml/2.2',
        'gx': 'http://www.google.com/kml/ext/2.2',
    }
    for placemark in root.findall('.//kml:Placemark', ns):
        name = placemark.find('kml:name', ns)
        name_text = name.text if name is not None else 'Unknown'
        if target_name and target_name.lower() not in name_text.lower():
            continue
        coords_elem = placemark.find('.//kml:coordinates', ns)
        if coords_elem is not None:
            coords_text = coords_elem.text.strip()
            coords = []
            for point in coords_text.split():
                parts = point.split(',')
                lon, lat = float(parts[0]), float(parts[1])
                coords.append((lon, lat))
            return {'name': name_text, 'coordinates': coords, 'polygon': Polygon(coords)}
    return None


# --- Sentinel-2 product discovery and band loading -------------------------

def list_sentinel_products(data_path, tile_list=None):
    """List Sentinel-2 SAFE directories, deduplicating by date (from notebooks)."""
    products = {}
    for safe_dir in sorted(data_path.rglob('*.SAFE')):
        if not safe_dir.is_dir():
            continue
        name_parts = safe_dir.name.split('_')
        if len(name_parts) < 6:
            continue
        tile_id = name_parts[5]
        if tile_list and tile_id not in tile_list:
            continue
        date_str = name_parts[2][:8]
        date_obj = datetime.strptime(date_str, '%Y%m%d')
        if date_str in products:
            existing_tile = products[date_str]['tile']
            if tile_list:
                existing_priority = tile_list.index(existing_tile) if existing_tile in tile_list else 999
                new_priority = tile_list.index(tile_id) if tile_id in tile_list else 999
                if new_priority >= existing_priority:
                    continue
            else:
                continue
        products[date_str] = {
            'path': safe_dir,
            'date': date_obj,
            'satellite': name_parts[0],
            'tile': tile_id,
            'doy': date_obj.timetuple().tm_yday,
        }
    return sorted(products.values(), key=lambda x: x['date'])


def list_stac_products(polygon, start, end, tile_list=None, max_cloud=100.0,
                       monthly_best=True,
                       collection='sentinel-2-l2a',
                       stac_url='https://planetarycomputer.microsoft.com/api/stac/v1'):
    """
    Discover Sentinel-2 L2A products from a STAC catalog (Microsoft Planetary
    Computer by default), returning the same product shape as
    list_sentinel_products but with remote COG band hrefs in product['assets'].

    Bands are read on demand via /vsicurl; only the polygon window and the four
    required bands (B02, B03, B04, B08) are fetched, avoiding full SAFE downloads.

    Parameters:
        polygon: shapely Polygon (EPSG:4326)
        start, end: 'YYYY-MM-DD' date strings (inclusive)
        tile_list: optional MGRS tile filter, e.g. ['T22JBT', 'T21JZN']
        max_cloud: maximum eo:cloud_cover percentage to accept
        monthly_best: keep only the lowest-cloud scene per calendar month. This
            approximates the ~1-scene-per-month cadence of the curated training
            set (22 dates), keeping the temporal-statistic features comparable to
            the trained model. When False, all scenes below max_cloud are kept.
    """
    import time
    import pystac_client
    import planetary_computer

    bounds = polygon.bounds

    # The Planetary Computer STAC endpoint occasionally returns transient 5xx
    # (502/503/504) or times out under load. Retry the catalog open + search +
    # item paging with exponential backoff so a momentary outage does not abort
    # the whole run.
    attempts = 4
    items = None
    last_err = None
    for attempt in range(attempts):
        try:
            catalog = pystac_client.Client.open(
                stac_url, modifier=planetary_computer.sign_inplace
            )
            search = catalog.search(
                collections=[collection],
                bbox=[bounds[0], bounds[1], bounds[2], bounds[3]],
                datetime=f'{start}/{end}',
                query={'eo:cloud_cover': {'lt': max_cloud}},
            )
            items = list(search.items())  # triggers HTTP paging
            break
        except Exception as e:
            last_err = e
            if attempt < attempts - 1:
                wait = 2 ** attempt  # 1s, 2s, 4s
                sys.stderr.write(json.dumps({
                    'progress': -1,
                    'msg': f'STAC unavailable, retrying in {wait}s ({attempt + 1}/{attempts})',
                }) + '\n')
                sys.stderr.flush()
                time.sleep(wait)
    if items is None:
        raise RuntimeError(
            'the Sentinel-2 STAC service (Planetary Computer) is temporarily '
            'unavailable; please try again in a moment'
        ) from last_err

    # B02/B03/B04/B08 are required by the spectral model; B8A/B11/B12 are also
    # collected (present in Planetary Computer assets) so the Prithvi path has
    # its six bands. Missing extra bands do not drop the scene.
    required_bands = ['B02', 'B03', 'B04', 'B08']
    extra_bands = ['B8A', 'B11', 'B12']
    products = {}
    for item in items:
        props = item.properties
        dt = props.get('datetime', '')
        date_obj = datetime.strptime(dt[:10], '%Y-%m-%d')
        date_str = date_obj.strftime('%Y%m%d')

        mgrs = props.get('s2:mgrs_tile') or ''
        tile_id = 'T' + mgrs if mgrs and not mgrs.startswith('T') else mgrs
        if tile_list and tile_id not in tile_list:
            continue

        cloud = float(props.get('eo:cloud_cover', 0.0))

        assets = {}
        ok = True
        for band in required_bands:
            if band not in item.assets:
                ok = False
                break
            assets[band] = item.assets[band].href
        if not ok:
            continue
        for band in extra_bands:
            if band in item.assets:
                assets[band] = item.assets[band].href

        # Deduplicate by date, preferring tile_list order, then lower cloud cover.
        if date_str in products:
            prev = products[date_str]
            if tile_list:
                prev_pri = tile_list.index(prev['tile']) if prev['tile'] in tile_list else 999
                new_pri = tile_list.index(tile_id) if tile_id in tile_list else 999
                if new_pri > prev_pri:
                    continue
                if new_pri == prev_pri and cloud >= prev['cloud_cover']:
                    continue
            elif cloud >= prev['cloud_cover']:
                continue

        products[date_str] = {
            'assets': assets,
            'date': date_obj,
            'satellite': props.get('platform', 'S2'),
            'tile': tile_id,
            'doy': date_obj.timetuple().tm_yday,
            'cloud_cover': cloud,
        }

    result = sorted(products.values(), key=lambda x: x['date'])

    if monthly_best:
        by_month = {}
        for p in result:
            key = (p['date'].year, p['date'].month)
            if key not in by_month or p['cloud_cover'] < by_month[key]['cloud_cover']:
                by_month[key] = p
        result = sorted(by_month.values(), key=lambda x: x['date'])

    return result


def find_band_file(safe_path, band_name, resolution='10m'):
    """Find a band .jp2 within the SAFE directory structure (from notebooks)."""
    granule_path = safe_path / 'GRANULE'
    if not granule_path.exists():
        return None
    for granule in granule_path.iterdir():
        img_path = granule / 'IMG_DATA' / f'R{resolution}'
        if img_path.exists():
            for f in img_path.iterdir():
                if band_name in f.name and f.suffix == '.jp2':
                    return f
    return None


def resolve_band_source(product, band_name, resolution='10m'):
    """
    Resolve a band to a readable raster reference for a product, supporting both
    local SAFE products (product['path']) and STAC products (product['assets']).
    Returns a path/href that rasterio can open (including remote /vsicurl COGs).
    """
    if product.get('assets'):
        href = product['assets'].get(band_name)
        if href is None:
            raise FileNotFoundError(f'Band {band_name} not in STAC assets')
        return href
    band_file = find_band_file(product['path'], band_name, resolution)
    if band_file is None:
        raise FileNotFoundError(f"Band {band_name} not found in {product['path']}")
    return band_file


def clip_band_from_source(source, polygon):
    """Open a raster source (local file or remote COG) and clip to the polygon."""
    with rasterio.open(source) as src:
        transformer = Transformer.from_crs('EPSG:4326', src.crs, always_xy=True)
        projected_polygon = shp_transform(transformer.transform, polygon)
        clipped, clipped_transform = rio_mask(src, [projected_polygon], crop=True, nodata=0)
        profile = {
            'transform': clipped_transform,
            'crs': src.crs,
            'height': clipped.shape[1],
            'width': clipped.shape[2],
        }
    return clipped[0].astype(np.float32), profile


def load_and_clip_band(product, band_name, polygon, resolution='10m'):
    """
    Load a Sentinel-2 band and clip it to the study-area polygon. Accepts either
    a product dict (local SAFE or STAC) or, for backwards compatibility, a SAFE
    Path object.
    """
    if not isinstance(product, dict):
        product = {'path': product}
    source = resolve_band_source(product, band_name, resolution)
    return clip_band_from_source(source, polygon)


def load_band_to_reference_grid(product, band_name, polygon, ref_profile, resolution='10m'):
    """Load a band and reproject to a reference grid if needed (from notebooks)."""
    band, band_profile = load_and_clip_band(product, band_name, polygon, resolution)
    if str(band_profile['crs']) == str(ref_profile['crs']):
        if (band.shape[0] == ref_profile['height'] and band.shape[1] == ref_profile['width']):
            return band
    dst = np.zeros((ref_profile['height'], ref_profile['width']), dtype=np.float32)
    reproject(
        source=band, destination=dst,
        src_transform=band_profile['transform'], src_crs=band_profile['crs'],
        dst_transform=ref_profile['transform'], dst_crs=ref_profile['crs'],
        resampling=Resampling.bilinear,
    )
    return dst


# --- Vegetation indices ----------------------------------------------------

def calculate_ndvi(nir, red):
    with np.errstate(divide='ignore', invalid='ignore'):
        ndvi = (nir - red) / (nir + red)
        ndvi = np.where(np.isfinite(ndvi), ndvi, 0)
    return np.clip(ndvi, -1, 1)


def calculate_evi(nir, red, blue, G=2.5, C1=6.0, C2=7.5, L=1.0):
    with np.errstate(divide='ignore', invalid='ignore'):
        evi = G * (nir - red) / (nir + C1 * red - C2 * blue + L)
        evi = np.where(np.isfinite(evi), evi, 0)
    return np.clip(evi, -1, 1)


def calculate_savi(nir, red, L=0.5):
    with np.errstate(divide='ignore', invalid='ignore'):
        savi = ((nir - red) / (nir + red + L)) * (1 + L)
        savi = np.where(np.isfinite(savi), savi, 0)
    return np.clip(savi, -1, 1)


# --- Feature engineering (matches feature_names.joblib) ---------------------

def compute_index_features(time_series):
    """Compute the 14 temporal features per index used by the trained model."""
    features = []
    for ts in time_series:
        feat = []
        feat.append(np.mean(ts))
        feat.append(np.std(ts))
        feat.append(np.max(ts))
        feat.append(np.min(ts))
        feat.append(np.max(ts) - np.min(ts))
        feat.append(np.median(ts))
        feat.append(np.argmax(ts))
        feat.append(np.argmin(ts))
        mid = len(ts) // 2
        wet = np.mean(ts[:mid]) if mid > 0 else np.mean(ts)
        dry = np.mean(ts[mid:]) if mid > 0 else np.mean(ts)
        feat.append(wet)
        feat.append(dry)
        feat.append(wet - dry)
        diff = np.diff(ts)
        feat.append(np.mean(diff) if len(diff) > 0 else 0.0)
        feat.append(np.max(diff) if len(diff) > 0 else 0.0)
        feat.append(np.min(diff) if len(diff) > 0 else 0.0)
        features.append(feat)
    return np.array(features)


def build_feature_matrix(products, polygon, ref_prof, n_dates_model):
    """
    Build the (N_pixels, 80) feature matrix from a list of products, matching
    the training pipeline. Returns (feature_matrix, valid_mask_2d) or (None, None).
    """
    ndvi_list, evi_list, savi_list = [], [], []
    band_lists = {'B02': [], 'B03': [], 'B04': [], 'B08': []}
    for product in products:
        try:
            blue = load_band_to_reference_grid(product, 'B02', polygon, ref_prof)
            green = load_band_to_reference_grid(product, 'B03', polygon, ref_prof)
            red = load_band_to_reference_grid(product, 'B04', polygon, ref_prof)
            nir = load_band_to_reference_grid(product, 'B08', polygon, ref_prof)
            blue_r, green_r, red_r, nir_r = (blue / 10000.0, green / 10000.0,
                                             red / 10000.0, nir / 10000.0)
            ndvi_list.append(calculate_ndvi(nir_r, red_r))
            evi_list.append(calculate_evi(nir_r, red_r, blue_r))
            savi_list.append(calculate_savi(nir_r, red_r))
            band_lists['B02'].append(blue_r)
            band_lists['B03'].append(green_r)
            band_lists['B04'].append(red_r)
            band_lists['B08'].append(nir_r)
        except Exception as e:
            sys.stderr.write(json.dumps({'progress': -1, 'msg': f'band error: {e}'}) + '\n')
            continue
    if len(ndvi_list) == 0:
        return None, None

    ndvi_stack = np.array(ndvi_list)
    evi_stack = np.array(evi_list)
    savi_stack = np.array(savi_list)
    band_stacks = {k: np.array(v) for k, v in band_lists.items()}

    n_times, height, width = ndvi_stack.shape
    ndvi_pixels = ndvi_stack.reshape(n_times, -1).T
    evi_pixels = evi_stack.reshape(n_times, -1).T
    savi_pixels = savi_stack.reshape(n_times, -1).T

    valid_obs = np.sum(ndvi_pixels != 0, axis=1)
    valid_mask_flat = valid_obs >= max(1, n_times * 0.5)

    for arr in [ndvi_pixels, evi_pixels, savi_pixels]:
        valid_arr = arr[valid_mask_flat]
        for i in range(valid_arr.shape[0]):
            ts = valid_arr[i]
            zero_mask = ts == 0
            if np.any(zero_mask) and np.any(~zero_mask):
                ts[zero_mask] = np.interp(
                    np.where(zero_mask)[0], np.where(~zero_mask)[0], ts[~zero_mask]
                )
                valid_arr[i] = ts
        arr[valid_mask_flat] = valid_arr

    all_features = []
    for pixels in [ndvi_pixels, evi_pixels, savi_pixels]:
        all_features.append(compute_index_features(pixels[valid_mask_flat]))
    for band_name in ['B02', 'B03', 'B04', 'B08']:
        stack = band_stacks[band_name]
        band_pixels = stack.reshape(n_times, -1).T[valid_mask_flat]
        band_mean = np.mean(band_pixels, axis=1)
        band_std = np.std(band_pixels, axis=1)
        band_max = np.max(band_pixels, axis=1)
        band_min = np.min(band_pixels, axis=1)
        all_features.append(np.column_stack([band_mean, band_std, band_max, band_min]))

    ndvi_raw = ndvi_pixels[valid_mask_flat]
    if n_times < n_dates_model:
        pad = np.zeros((ndvi_raw.shape[0], n_dates_model - n_times))
        ndvi_raw = np.hstack([ndvi_raw, pad])
    elif n_times > n_dates_model:
        ndvi_raw = ndvi_raw[:, -n_dates_model:]
    all_features.append(ndvi_raw)

    feature_matrix = np.hstack(all_features)
    valid_mask_2d = valid_mask_flat.reshape(height, width)
    return feature_matrix, valid_mask_2d


# --- Classification --------------------------------------------------------

def classify_from_features(feature_matrix, valid_mask, model, scaler, label_encoder):
    """Apply the trained model; return a (H, W) map of class IDs (-1 = invalid)."""
    height, width = valid_mask.shape
    classification_map = np.full((height, width), -1, dtype=np.int32)
    X_scaled = scaler.transform(feature_matrix)
    pred_encoded = model.predict(X_scaled)
    pred_classes = label_encoder.inverse_transform(pred_encoded)
    rows, cols = np.where(valid_mask)
    classification_map[rows, cols] = pred_classes
    return classification_map


# --- MapBiomas (soja mask for temporal retention) --------------------------

def reproject_mapbiomas_to_grid(mapbiomas_path, ref_profile, ref_band_data):
    """Reproject a cached MapBiomas raster to the Sentinel-2 reference grid."""
    with rasterio.open(mapbiomas_path) as src:
        mb_data = src.read(1)
        mb_transform = src.transform
        mb_crs = src.crs
    dst = np.zeros((ref_profile['height'], ref_profile['width']), dtype=np.uint8)
    reproject(
        source=mb_data.astype(np.uint8), destination=dst,
        src_transform=mb_transform, src_crs=mb_crs,
        dst_transform=ref_profile['transform'], dst_crs=ref_profile['crs'],
        resampling=Resampling.nearest,
    )
    dst[~(ref_band_data > 0)] = 0
    return dst


# --- Georeferencing --------------------------------------------------------

def get_map_extent(profile):
    """Compute the EPSG:4326 lat/lon extent from a raster profile (from notebooks)."""
    t = profile['transform']
    h, w = profile['height'], profile['width']
    left = t.c
    top = t.f
    right = left + w * t.a
    bottom = top + h * t.e
    transformer = Transformer.from_crs(profile['crs'], 'EPSG:4326', always_xy=True)
    lon_min, lat_min = transformer.transform(left, bottom)
    lon_max, lat_max = transformer.transform(right, top)
    return lon_min, lon_max, lat_min, lat_max


def hex_to_rgb(hex_color):
    h = hex_color.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def write_overlay_png(classification_map, out_path):
    """Write an RGBA PNG of the classification map using the MapBiomas palette."""
    h, w = classification_map.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    for cls_id, hex_color in MAPBIOMAS_COLORS.items():
        mask = classification_map == cls_id
        if np.any(mask):
            r, g, b = hex_to_rgb(hex_color)
            rgba[mask] = [r, g, b, 255]
    # invalid pixels stay fully transparent (alpha = 0)
    with rasterio.open(
        out_path, 'w', driver='PNG', height=h, width=w, count=4, dtype='uint8'
    ) as dst:
        for i in range(4):
            dst.write(rgba[:, :, i], i + 1)


def write_classification_tif(classification_map, ref_profile, out_path):
    """Write the classification map as a georeferenced GeoTIFF (from notebooks)."""
    tif_profile = {
        'driver': 'GTiff',
        'dtype': 'int16',
        'width': ref_profile['width'],
        'height': ref_profile['height'],
        'count': 1,
        'crs': ref_profile['crs'],
        'transform': ref_profile['transform'],
        'compress': 'lzw',
        'nodata': -1,
    }
    with rasterio.open(out_path, 'w', **tif_profile) as dst:
        dst.write(classification_map.astype(np.int16), 1)


def class_statistics(classification_map):
    """Build per-class statistics (pixels, pct, area_ha) at 10 m resolution."""
    valid = classification_map[classification_map >= 0]
    total = int(valid.size)
    stats = []
    if total == 0:
        return stats
    unique_pred, counts = np.unique(valid, return_counts=True)
    for cls_id, count in zip(unique_pred, counts):
        cls_id = int(cls_id)
        stats.append({
            'class_id': cls_id,
            'name': MAPBIOMAS_LEGEND.get(cls_id, f'Class {cls_id}'),
            'color': MAPBIOMAS_COLORS.get(cls_id, '#cccccc'),
            'pixels': int(count),
            'pct': float(round(100.0 * count / total, 2)),
            'area_ha': float(round(count * 100.0 / 10000.0, 2)),
        })
    stats.sort(key=lambda s: s['pixels'], reverse=True)
    return stats


# --- Prithvi-EO 2.0 classification -----------------------------------------

def classify_prithvi(products, polygon, ref_profile, model_dir, mode):
    """
    Classify a representative acquisition using frozen Prithvi-EO 2.0 embeddings
    and the matching Random Forest head. mode is 'pixel' or 'patch'.
    Returns a (H, W) map of MapBiomas class ids (-1 = invalid).
    """
    import prithvi as pv

    rf_path = model_dir / f'prithvi_rf_{mode}.joblib'
    sc_path = model_dir / f'prithvi_scaler_{mode}.joblib'
    le_path = model_dir / 'prithvi_label_encoder.joblib'
    for p in (rf_path, sc_path, le_path):
        if not p.exists():
            fail(f'Prithvi model artifact missing: {p.name}. Train it with train_prithvi.py')
    rf = joblib.load(rf_path)
    sc = joblib.load(sc_path)
    le = joblib.load(le_path)

    target = products[len(products) // 2]
    emit_progress(30, f'loading Prithvi bands ({target["date"].strftime("%Y-%m-%d")})')
    bands = []
    for name, res in [('B02', '10m'), ('B03', '10m'), ('B04', '10m'),
                      ('B8A', '20m'), ('B11', '20m'), ('B12', '20m')]:
        arr = load_band_to_reference_grid(target, name, polygon, ref_profile, resolution=res)
        bands.append(np.clip(arr / 10000.0, 0, 1))
    band_stack = np.stack(bands, axis=0).astype(np.float32)

    ref0 = bands[2]  # B04
    valid = ref0 > 0
    height, width = valid.shape
    cls_map = np.full((height, width), -1, dtype=np.int32)

    emit_progress(45, f'extracting Prithvi embeddings ({mode})')
    if mode == 'patch':
        emb_map = pv.embed_patches(band_stack, valid)
        X = emb_map[valid]
    else:
        X = pv.embed_pixels(band_stack, valid)

    emit_progress(85, 'classifying embeddings')
    pred = le.inverse_transform(rf.predict(sc.transform(X)))
    rows, cols = np.where(valid)
    cls_map[rows, cols] = pred
    return cls_map


# --- Main ------------------------------------------------------------------

def configure_gdal_for_cog():
    """Tune GDAL/rasterio for efficient remote COG range reads."""
    import os
    os.environ.setdefault('GDAL_DISABLE_READDIR_ON_OPEN', 'EMPTY_DIR')
    os.environ.setdefault('CPL_VSIL_CURL_ALLOWED_EXTENSIONS', '.tif,.TIF,.tiff')
    os.environ.setdefault('GDAL_HTTP_MULTIRANGE', 'YES')
    os.environ.setdefault('GDAL_HTTP_MERGE_CONSECUTIVE_RANGES', 'YES')
    os.environ.setdefault('VSI_CACHE', 'TRUE')


def main():
    try:
        req = json.load(sys.stdin)
    except Exception as e:
        fail(f'invalid request JSON: {e}')

    model_dir = Path(req.get('model_dir', ''))
    source = req.get('source', 'stac')  # 'stac' (cloud COG) or 'local' (.SAFE)
    sentinel_dir = Path(req.get('sentinel_dir', '')) if req.get('sentinel_dir') else None
    tiles = req.get('tiles') or None
    mode = req.get('mode', 'single')
    work_dir = Path(req.get('work_dir', '.'))
    mapbiomas_path = req.get('mapbiomas_path')
    # STAC parameters (used when source == 'stac').
    start = req.get('start')
    end = req.get('end')
    max_cloud = float(req.get('max_cloud', 100.0))
    monthly_best = bool(req.get('monthly_best', True))
    # Model selection: 'spectral' (Random Forest on spectro-temporal features,
    # default) or 'prithvi' (Random Forest on frozen Prithvi-EO 2.0 embeddings).
    model_kind = req.get('model_kind', 'spectral')
    prithvi_mode = req.get('prithvi_mode', 'pixel')  # 'pixel' or 'patch'
    work_dir.mkdir(parents=True, exist_ok=True)

    if source == 'stac':
        configure_gdal_for_cog()

    # Resolve polygon from explicit geometry or KML path.
    if req.get('polygon_geojson'):
        polygon = polygon_from_geojson(req['polygon_geojson'])
    elif req.get('kml_path'):
        area = parse_kml_coordinates(Path(req['kml_path']), req.get('kml_target'))
        if area is None:
            fail('polygon not found in KML')
        polygon = area['polygon']
    else:
        fail('no polygon provided (polygon_geojson or kml_path required)')

    if not model_dir.exists():
        fail(f'model directory not found: {model_dir}')

    rf_model = scaler = label_encoder = feature_names = None
    n_dates_model = 22
    if model_kind == 'spectral':
        emit_progress(5, 'loading model artifacts')
        try:
            rf_model = joblib.load(model_dir / 'rf_classifier.joblib')
            scaler = joblib.load(model_dir / 'scaler.joblib')
            label_encoder = joblib.load(model_dir / 'label_encoder.joblib')
            feature_names = joblib.load(model_dir / 'feature_names.joblib')
        except Exception as e:
            fail(f'failed to load model artifacts: {e}')
        # N_DATES_MODEL: total features minus the 58 non-temporal features
        # (14 stats * 3 indices + 16 band stats). Remainder are raw NDVI dates.
        n_dates_model = len(feature_names) - 58

    if source == 'stac':
        if not start or not end:
            fail('STAC source requires start and end dates (YYYY-MM-DD)')
        emit_progress(10, 'querying STAC catalog (Planetary Computer)')
        try:
            products = list_stac_products(
                polygon, start, end, tile_list=tiles, max_cloud=max_cloud,
                monthly_best=monthly_best,
            )
        except Exception as e:
            fail(f'STAC query failed: {e}')
        if len(products) == 0:
            fail('no Sentinel-2 scenes found for the area, dates and cloud filter')
        sel = 'best/month' if monthly_best else f'all < {max_cloud:.0f}% cloud'
        emit_progress(15, f'{len(products)} scenes selected ({sel})')
    else:
        if sentinel_dir is None or not sentinel_dir.exists():
            fail(f'Sentinel-2 directory not found: {sentinel_dir}')
        emit_progress(10, 'discovering local Sentinel-2 products')
        products = list_sentinel_products(sentinel_dir, tile_list=tiles)
        if len(products) == 0:
            fail('no Sentinel-2 .SAFE products found in the selected directory')
        emit_progress(15, f'{len(products)} products found')

    # Reference grid from the first product's B04 band.
    try:
        ref_band, ref_profile = load_and_clip_band(products[0], 'B04', polygon)
    except Exception as e:
        fail(f'failed to build reference grid: {e}')

    # Optional MapBiomas soja mask for temporal retention.
    soja_mask = None
    if mapbiomas_path and Path(mapbiomas_path).exists():
        try:
            mb = reproject_mapbiomas_to_grid(mapbiomas_path, ref_profile, ref_band)
            soja_mask = mb == SOJA_CLASS_ID
            emit_progress(18, f'soja reference pixels: {int(np.sum(soja_mask))}')
        except Exception as e:
            sys.stderr.write(json.dumps({'progress': -1, 'msg': f'mapbiomas error: {e}'}) + '\n')

    temporal = []

    if model_kind == 'prithvi':
        classification_map = classify_prithvi(
            products, polygon, ref_profile, model_dir, prithvi_mode
        )
    elif mode == 'temporal':
        n = len(products)
        for idx in range(n):
            cumulative = products[:idx + 1]
            target = products[idx]
            date_str = target['date'].strftime('%Y-%m-%d')
            pct = 20 + int(70 * (idx + 1) / n)
            emit_progress(pct, f'temporal stack {idx + 1}/{n} ({date_str})')

            fm, vmask = build_feature_matrix(cumulative, polygon, ref_profile, n_dates_model)
            if fm is None:
                continue
            cls_map = classify_from_features(fm, vmask, rf_model, scaler, label_encoder)

            # NDVI of the target date over the soja reference pixels.
            soja_ndvi_mean = None
            soja_ret = None
            dominant = None
            if soja_mask is not None:
                try:
                    red = load_band_to_reference_grid(target, 'B04', polygon, ref_profile) / 10000.0
                    nir = load_band_to_reference_grid(target, 'B08', polygon, ref_profile) / 10000.0
                    ndvi_map = calculate_ndvi(nir, red)
                    sv = ndvi_map[soja_mask & (ndvi_map != 0)]
                    soja_ndvi_mean = float(np.mean(sv)) if sv.size > 0 else None
                except Exception:
                    pass
                soja_preds = cls_map[soja_mask & (cls_map >= 0)]
                if soja_preds.size > 0:
                    up, pc = np.unique(soja_preds, return_counts=True)
                    dist = {int(c): int(v) for c, v in zip(up, pc)}
                    dom_id = int(up[np.argmax(pc)])
                    dominant = MAPBIOMAS_LEGEND.get(dom_id, str(dom_id))
                    soja_ret = round(100.0 * dist.get(SOJA_CLASS_ID, 0) / soja_preds.size, 1)

            temporal.append({
                'date': date_str,
                'n_dates_stack': len(cumulative),
                'soja_ndvi_mean': (round(soja_ndvi_mean, 4) if soja_ndvi_mean is not None else None),
                'soja_retention_pct': soja_ret,
                'dominant': dominant,
            })

        # Final map = full cumulative stack (last iteration).
        fm, vmask = build_feature_matrix(products, polygon, ref_profile, n_dates_model)
        if fm is None:
            fail('no valid Sentinel-2 data for the selected area')
        classification_map = classify_from_features(fm, vmask, rf_model, scaler, label_encoder)
    else:
        emit_progress(40, f'building features ({len(products)} dates)')
        fm, vmask = build_feature_matrix(products, polygon, ref_profile, n_dates_model)
        if fm is None:
            fail('no valid Sentinel-2 data for the selected area')
        emit_progress(80, 'classifying')
        classification_map = classify_from_features(fm, vmask, rf_model, scaler, label_encoder)

    emit_progress(92, 'writing overlay and GeoTIFF')
    overlay_png = work_dir / 'overlay.png'
    raster_tif = work_dir / 'classification_map.tif'
    write_overlay_png(classification_map, overlay_png)
    write_classification_tif(classification_map, ref_profile, raster_tif)

    lon_min, lon_max, lat_min, lat_max = get_map_extent(ref_profile)

    result = {
        'extent': {
            'lon_min': float(lon_min), 'lon_max': float(lon_max),
            'lat_min': float(lat_min), 'lat_max': float(lat_max),
        },
        'overlay_png': str(overlay_png),
        'raster_tif': str(raster_tif),
        'n_dates': len(products),
        'date_range': [
            products[0]['date'].strftime('%Y-%m-%d'),
            products[-1]['date'].strftime('%Y-%m-%d'),
        ],
        'class_stats': class_statistics(classification_map),
        'temporal': temporal,
    }

    emit_progress(100, 'done')
    sys.stdout.write(json.dumps(result))
    sys.stdout.flush()


if __name__ == '__main__':
    main()
