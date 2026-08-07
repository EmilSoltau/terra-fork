"""Preprocessing tools: bbox windowed reads, calibration, cloud masking, and a
band-ratio index registry (offline-testable pure functions).

This is the "extract + tools" layer that turns raw Sentinel-2 L2A COG assets into
an analysis-ready, cloud-masked, correctly-scaled surface-reflectance cube plus
derived indices. Pure array helpers here mirror the style of ``composite.py`` and
are unit-tested without network; ``windowed_read`` is the only I/O function.
"""

from __future__ import annotations

from typing import Callable

import numpy as np

# --- Sentinel-2 L2A Scene Classification (SCL) classes -----------------------
# https://sentinels.copernicus.eu/web/sentinel/technical-guides/sentinel-2-msi/level-2a/algorithm-overview
SCL_NODATA = 0
SCL_SATURATED = 1
SCL_DARK_AREA = 2
SCL_CLOUD_SHADOW = 3
SCL_VEGETATION = 4
SCL_BARE_SOIL = 5
SCL_WATER = 6
SCL_CLOUD_LOW = 7
SCL_CLOUD_MEDIUM = 8
SCL_CLOUD_HIGH = 9
SCL_THIN_CIRRUS = 10
SCL_SNOW = 11

# Pixels to drop by default: no-data, saturated, cloud shadow, medium/high cloud,
# thin cirrus, snow. (Cloud-shadow and cirrus are the ones scene-level cloud
# cover misses; see Week 16 spec Section 7.6.)
SCL_MASK_CLASSES = (
    SCL_NODATA,
    SCL_SATURATED,
    SCL_CLOUD_SHADOW,
    SCL_CLOUD_MEDIUM,
    SCL_CLOUD_HIGH,
    SCL_THIN_CIRRUS,
    SCL_SNOW,
)

# Sentinel-2 L2A surface-reflectance encoding: reflectance = DN * scale (+ offset).
# Baseline 04.00 (2022+) adds a -0.1 BOA offset; pass it explicitly when known.
S2_REFLECTANCE_SCALE = 1e-4
S2_REFLECTANCE_OFFSET = 0.0

# Any |raw value| at or above this is treated as an unmarked nodata marker
# (e.g. 1e38 fill) even when the asset declares no nodata tag (Week 24 Tier-1).
MARKER_ABS_THRESHOLD = 1e30


def apply_scale_offset(
    arr: np.ndarray,
    scale: float = S2_REFLECTANCE_SCALE,
    offset: float = S2_REFLECTANCE_OFFSET,
    nodata: float | None = None,
) -> tuple[np.ndarray, np.ndarray]:
    """Convert raw DN to physical reflectance and return ``(values, valid)``.

    ``values`` is float32 with masked samples set to NaN; ``valid`` is a boolean
    array (True where the pixel is usable). Drops the declared ``nodata`` value,
    non-finite samples, and unmarked fill markers (|raw| >= ``MARKER_ABS_THRESHOLD``).
    """
    raw = arr.astype(np.float64)
    valid = np.isfinite(raw)
    if nodata is not None:
        valid &= raw != nodata
    valid &= np.abs(raw) < MARKER_ABS_THRESHOLD

    out = np.full(raw.shape, np.nan, dtype=np.float32)
    out[valid] = (raw[valid] * scale + offset).astype(np.float32)
    return out, valid


def build_scl_mask(
    scl: np.ndarray,
    classes: tuple[int, ...] = SCL_MASK_CLASSES,
    dilate: int = 2,
) -> np.ndarray:
    """Return a boolean ``valid`` mask (True = keep) from a Sentinel-2 SCL band.

    Pixels whose SCL class is in ``classes`` are dropped. The dropped region is
    grown by ``dilate`` pixels to catch cloud/shadow edges (Week 24 dilation rule).
    """
    scl_int = np.asarray(scl).astype(np.int16)
    drop = np.isin(scl_int, np.asarray(classes, dtype=np.int16))
    if dilate and dilate > 0 and drop.any():
        from scipy import ndimage

        structure = ndimage.generate_binary_structure(2, 2)
        drop = ndimage.binary_dilation(drop, structure=structure, iterations=int(dilate))
    return ~drop


def valid_fraction(mask: np.ndarray) -> float:
    """Fraction of True (usable) pixels in a boolean mask."""
    mask = np.asarray(mask)
    if mask.size == 0:
        return 0.0
    return float(np.count_nonzero(mask)) / float(mask.size)


# --- Band-ratio index registry ----------------------------------------------
# Each entry: index name -> (required bands, function(bands_dict) -> float array).
# Bands are surface reflectance. Mineral ratios follow the user's Week 16
# RS-for-MPM spec (Section 4); the neutral core is domain-agnostic so this
# registry is the single place to add crop / water / mineral indices.


def _safe_ratio(num: np.ndarray, den: np.ndarray) -> np.ndarray:
    with np.errstate(divide="ignore", invalid="ignore"):
        out = num.astype(np.float32) / den.astype(np.float32)
    return np.where(np.isfinite(out), out, np.nan).astype(np.float32)


def _norm_diff(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    with np.errstate(divide="ignore", invalid="ignore"):
        out = (a - b) / (a + b)
    return np.clip(np.where(np.isfinite(out), out, np.nan), -1.0, 1.0).astype(np.float32)


def _iron_oxide(b):  # ferric iron / gossans, laterites
    return _safe_ratio(b["B04"], b["B02"])


def _ferrous_iron(b):  # propylitic (chlorite, epidote) — per Week 16 spec (B08/B11)
    return _safe_ratio(b["B08"], b["B11"])


def _clay_hydroxyl(b):  # argillic (kaolinite, illite)
    return _safe_ratio(b["B11"], b["B12"])


def _carbonate(b):  # coarse Sentinel-2 carbonate proxy (inverse of clay)
    return _safe_ratio(b["B12"], b["B11"])


def _ndvi(b):  # vegetation (quality/masking indicator)
    return _norm_diff(b["B08"], b["B04"])


# name -> (required_bands, func)
INDEX_REGISTRY: dict[str, tuple[tuple[str, ...], Callable[[dict], np.ndarray]]] = {
    "iron_oxide": (("B04", "B02"), _iron_oxide),
    "ferrous_iron": (("B08", "B11"), _ferrous_iron),
    "clay_hydroxyl": (("B11", "B12"), _clay_hydroxyl),
    "carbonate": (("B11", "B12"), _carbonate),
    "ndvi": (("B08", "B04"), _ndvi),
}

ALLOWED_INDICES = tuple(INDEX_REGISTRY.keys())


def required_bands_for(indices: list[str]) -> list[str]:
    """Union of bands needed to compute the requested indices (order-stable)."""
    seen: list[str] = []
    for name in indices:
        entry = INDEX_REGISTRY.get(name)
        if entry is None:
            raise ValueError(f"unknown index: {name!r} (allowed: {ALLOWED_INDICES})")
        for band in entry[0]:
            if band not in seen:
                seen.append(band)
    return seen


def compute_index(bands: dict, name: str) -> np.ndarray:
    """Compute a single index from a dict of ``{band_name: reflectance_array}``."""
    entry = INDEX_REGISTRY.get(name)
    if entry is None:
        raise ValueError(f"unknown index: {name!r} (allowed: {ALLOWED_INDICES})")
    required, func = entry
    missing = [b for b in required if b not in bands]
    if missing:
        raise KeyError(f"index {name!r} needs bands {required}; missing {missing}")
    return func(bands)


def median_composite(arrays: list[np.ndarray]) -> np.ndarray:
    """Per-pixel median across a list of 2-D arrays, ignoring NaN (masked) samples.

    Used for the *ratio-then-composite* order (Week 16 Section 7.2): compute an
    index (or band) per scene, then median across scenes so illumination cancels
    inside each scene before combining. All-NaN pixels stay NaN.
    """
    if not arrays:
        raise ValueError("median_composite: no arrays given")
    stack = np.stack([a.astype(np.float32) for a in arrays], axis=0)
    with np.errstate(invalid="ignore"):
        all_nan = np.all(np.isnan(stack), axis=0)
        out = np.full(stack.shape[1:], np.nan, dtype=np.float32)
        good = ~all_nan
        if np.any(good):
            out[good] = np.nanmedian(stack[:, good], axis=0)
    return out


def write_cube_geotiff(
    cube: np.ndarray,
    ref_profile: dict,
    band_names: list[str],
    out_path,
) -> None:
    """Write a ``(bands, H, W)`` float32 cube as a multiband GeoTIFF.

    NaN is the nodata value; each band is tagged with its name/description.
    """
    import rasterio

    if cube.ndim != 3:
        raise ValueError(f"cube must be (bands, H, W); got shape {cube.shape}")
    count, h, w = cube.shape
    if len(band_names) != count:
        raise ValueError(f"{len(band_names)} band names for {count} bands")
    profile = {
        "driver": "GTiff",
        "height": h,
        "width": w,
        "count": count,
        "dtype": "float32",
        "crs": ref_profile.get("crs"),
        "transform": ref_profile["transform"],
        "nodata": float("nan"),
        "compress": "lzw",
    }
    with rasterio.open(out_path, "w", **profile) as dst:
        for i in range(count):
            dst.write(cube[i].astype(np.float32), i + 1)
            dst.set_band_description(i + 1, band_names[i])


def windowed_read(href: str, bbox_lonlat: tuple[float, float, float, float]):
    """Read only the ``bbox_lonlat`` (lon_min, lat_min, lon_max, lat_max) window
    of a COG. Returns ``(array2d, profile)`` in the asset's native CRS/grid.

    The bbox is reprojected into the source CRS before windowing, so only the
    needed bytes are fetched over ``/vsicurl`` (the primitive TERRA's predict
    path lacks — it clips whole scenes instead).
    """
    import rasterio
    from rasterio.warp import transform_bounds
    from rasterio.windows import from_bounds

    lon_min, lat_min, lon_max, lat_max = bbox_lonlat
    with rasterio.open(href) as src:
        left, bottom, right, top = transform_bounds(
            "EPSG:4326", src.crs, lon_min, lat_min, lon_max, lat_max, densify_pts=21
        )
        window = from_bounds(left, bottom, right, top, transform=src.transform)
        window = window.round_offsets().round_lengths()
        data = src.read(1, window=window, boundless=True, fill_value=0)
        win_transform = src.window_transform(window)
        profile = {
            "crs": src.crs,
            "transform": win_transform,
            "height": data.shape[0],
            "width": data.shape[1],
            "nodata": src.nodata,
            "scales": src.scales,
            "offsets": src.offsets,
        }
    return data, profile
