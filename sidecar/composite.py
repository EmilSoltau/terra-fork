"""Band composite / spectral-index rendering helpers (offline-testable)."""

from __future__ import annotations

import numpy as np

# Sentinel-2 L2A band → native resolution used when loading SAFE/STAC assets.
BAND_RESOLUTION = {
    "B02": "10m",
    "B03": "10m",
    "B04": "10m",
    "B05": "20m",
    "B06": "20m",
    "B07": "20m",
    "B08": "10m",
    "B8A": "20m",
    "B11": "20m",
    "B12": "20m",
}

RGB_PRESETS = {
    "true_color": ("B04", "B03", "B02"),
    "false_color_ir": ("B08", "B04", "B03"),
    "agriculture": ("B11", "B08", "B02"),
    "swir": ("B12", "B8A", "B04"),
}

ALLOWED_BANDS = tuple(BAND_RESOLUTION.keys())
ALLOWED_INDICES = ("ndvi", "ndwi", "ndmi", "evi")


def percentile_stretch(
    arr: np.ndarray,
    mask: np.ndarray,
    low: float = 2.0,
    high: float = 98.0,
) -> np.ndarray:
    """Linear stretch of valid pixels to [0, 1] using percentiles."""
    out = np.zeros(arr.shape, dtype=np.float32)
    valid = mask & np.isfinite(arr)
    if not np.any(valid):
        return out
    vals = arr[valid]
    p_lo, p_hi = np.percentile(vals, [low, high])
    if p_hi <= p_lo:
        out[valid] = 0.5
        return out
    scaled = (arr - p_lo) / (p_hi - p_lo)
    out[valid] = np.clip(scaled[valid], 0.0, 1.0)
    return out


def calculate_ndwi(green: np.ndarray, nir: np.ndarray) -> np.ndarray:
    """McFeeters NDWI: (Green - NIR) / (Green + NIR)."""
    with np.errstate(divide="ignore", invalid="ignore"):
        ndwi = (green - nir) / (green + nir)
        ndwi = np.where(np.isfinite(ndwi), ndwi, 0.0)
    return np.clip(ndwi, -1.0, 1.0)


def calculate_ndmi(nir: np.ndarray, swir: np.ndarray) -> np.ndarray:
    """NDMI: (NIR - SWIR) / (NIR + SWIR)."""
    with np.errstate(divide="ignore", invalid="ignore"):
        ndmi = (nir - swir) / (nir + swir)
        ndmi = np.where(np.isfinite(ndmi), ndmi, 0.0)
    return np.clip(ndmi, -1.0, 1.0)


def _lerp_cmap(t: np.ndarray, stops: list[tuple[float, float, float]]) -> np.ndarray:
    """Map t in [0,1] through RGB color stops → (…, 3) float 0–1."""
    t = np.clip(t, 0.0, 1.0)
    n = len(stops) - 1
    idx = np.minimum((t * n).astype(np.int32), n - 1)
    f = t * n - idx
    stops_a = np.array(stops, dtype=np.float32)
    c0 = stops_a[idx]
    c1 = stops_a[idx + 1]
    return c0 + (c1 - c0) * f[..., None]


# Approximate RdYlGn for vegetation indices (low→high).
_RDYLGN = [
    (0.65, 0.0, 0.15),
    (0.96, 0.43, 0.26),
    (0.99, 0.75, 0.39),
    (1.0, 1.0, 0.75),
    (0.67, 0.87, 0.54),
    (0.4, 0.74, 0.39),
    (0.1, 0.47, 0.22),
]

# Blues for water-oriented indices.
_BLUES = [
    (0.97, 0.98, 1.0),
    (0.78, 0.86, 0.94),
    (0.42, 0.68, 0.84),
    (0.19, 0.45, 0.69),
    (0.03, 0.19, 0.42),
]


def index_to_rgba(
    index: np.ndarray,
    mask: np.ndarray,
    name: str,
    stretch_low: float = 2.0,
    stretch_high: float = 98.0,
) -> np.ndarray:
    """Colormap a spectral index to RGBA uint8."""
    stretched = percentile_stretch(index.astype(np.float32), mask, stretch_low, stretch_high)
    stops = _BLUES if name in ("ndwi", "ndmi") else _RDYLGN
    rgb = _lerp_cmap(stretched, stops)
    h, w = index.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[..., 0] = (rgb[..., 0] * 255).astype(np.uint8)
    rgba[..., 1] = (rgb[..., 1] * 255).astype(np.uint8)
    rgba[..., 2] = (rgb[..., 2] * 255).astype(np.uint8)
    rgba[..., 3] = np.where(mask, 255, 0).astype(np.uint8)
    return rgba


def rgb_to_rgba(
    r: np.ndarray,
    g: np.ndarray,
    b: np.ndarray,
    mask: np.ndarray,
    stretch_low: float = 2.0,
    stretch_high: float = 98.0,
) -> np.ndarray:
    """Percentile-stretch three reflectance bands to RGBA uint8."""
    rs = percentile_stretch(r, mask, stretch_low, stretch_high)
    gs = percentile_stretch(g, mask, stretch_low, stretch_high)
    bs = percentile_stretch(b, mask, stretch_low, stretch_high)
    h, w = r.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[..., 0] = (rs * 255).astype(np.uint8)
    rgba[..., 1] = (gs * 255).astype(np.uint8)
    rgba[..., 2] = (bs * 255).astype(np.uint8)
    rgba[..., 3] = np.where(mask, 255, 0).astype(np.uint8)
    return rgba


def write_rgba_png(rgba: np.ndarray, out_path) -> None:
    """Write (H,W,4) uint8 PNG via rasterio."""
    import rasterio
    from rasterio.transform import Affine

    h, w = rgba.shape[:2]
    profile = {
        "driver": "PNG",
        "height": h,
        "width": w,
        "count": 4,
        "dtype": "uint8",
        "transform": Affine.identity(),
    }
    with rasterio.open(out_path, "w", **profile) as dst:
        for i in range(4):
            dst.write(rgba[:, :, i], i + 1)


def extent_from_profile(profile: dict) -> dict:
    """Lon/lat bounds from a rasterio-like profile (EPSG:4326 or projected)."""
    from pyproj import Transformer
    from rasterio.transform import array_bounds

    transform = profile["transform"]
    h = profile["height"]
    w = profile["width"]
    left, bottom, right, top = array_bounds(h, w, transform)
    crs = profile.get("crs")
    if crs is None or str(crs) in ("EPSG:4326", "OGC:CRS84"):
        return {
            "lon_min": float(left),
            "lat_min": float(bottom),
            "lon_max": float(right),
            "lat_max": float(top),
        }
    transformer = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
    lon_a, lat_a = transformer.transform(left, bottom)
    lon_b, lat_b = transformer.transform(right, top)
    return {
        "lon_min": float(min(lon_a, lon_b)),
        "lat_min": float(min(lat_a, lat_b)),
        "lon_max": float(max(lon_a, lon_b)),
        "lat_max": float(max(lat_a, lat_b)),
    }
