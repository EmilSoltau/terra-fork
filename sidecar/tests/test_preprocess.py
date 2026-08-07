"""Offline tests for preprocessing tools (calibration, SCL mask, indices)."""

import numpy as np

import preprocess


def test_apply_scale_offset_reflectance():
    dn = np.array([[0, 1000, 5000]], dtype=np.uint16)
    vals, valid = preprocess.apply_scale_offset(dn, scale=1e-4, offset=0.0)
    assert valid.all()
    assert np.allclose(vals, [[0.0, 0.1, 0.5]], atol=1e-6)
    assert vals.dtype == np.float32


def test_apply_scale_offset_masks_nodata_and_markers():
    raw = np.array([[100, 0, 1e38, np.nan]], dtype=np.float64)
    vals, valid = preprocess.apply_scale_offset(raw, scale=1e-4, nodata=0)
    # index0 valid; index1 is declared nodata; index2 is a fill marker; index3 NaN
    assert valid.tolist() == [[True, False, False, False]]
    assert np.isnan(vals[0, 1]) and np.isnan(vals[0, 2]) and np.isnan(vals[0, 3])
    assert abs(float(vals[0, 0]) - 0.01) < 1e-6


def test_build_scl_mask_drops_cloud_classes():
    scl = np.array(
        [
            [preprocess.SCL_VEGETATION, preprocess.SCL_CLOUD_HIGH],
            [preprocess.SCL_BARE_SOIL, preprocess.SCL_CLOUD_SHADOW],
        ],
        dtype=np.uint8,
    )
    valid = preprocess.build_scl_mask(scl, dilate=0)
    assert valid.tolist() == [[True, False], [True, False]]


def test_build_scl_mask_dilation_grows_dropped_region():
    scl = np.full((5, 5), preprocess.SCL_VEGETATION, dtype=np.uint8)
    scl[2, 2] = preprocess.SCL_CLOUD_HIGH
    valid_no = preprocess.build_scl_mask(scl, dilate=0)
    valid_dl = preprocess.build_scl_mask(scl, dilate=1)
    assert np.count_nonzero(~valid_no) == 1
    # 3x3 (8-connected) dilation grows the single cloud pixel to 9 dropped pixels
    assert np.count_nonzero(~valid_dl) == 9


def test_valid_fraction():
    m = np.array([[True, False], [True, True]])
    assert abs(preprocess.valid_fraction(m) - 0.75) < 1e-9


def test_index_registry_formulas():
    bands = {
        "B02": np.array([[0.10]], np.float32),
        "B04": np.array([[0.20]], np.float32),
        "B08": np.array([[0.40]], np.float32),
        "B11": np.array([[0.25]], np.float32),
        "B12": np.array([[0.20]], np.float32),
    }
    assert abs(float(preprocess.compute_index(bands, "iron_oxide")[0, 0]) - 2.0) < 1e-5  # B04/B02
    assert abs(float(preprocess.compute_index(bands, "clay_hydroxyl")[0, 0]) - 1.25) < 1e-5  # B11/B12
    assert abs(float(preprocess.compute_index(bands, "carbonate")[0, 0]) - 0.8) < 1e-5  # B12/B11
    ndvi = float(preprocess.compute_index(bands, "ndvi")[0, 0])  # (0.4-0.2)/(0.4+0.2)
    assert abs(ndvi - (0.2 / 0.6)) < 1e-5


def test_index_unknown_and_missing_band():
    import pytest

    with pytest.raises(ValueError):
        preprocess.compute_index({}, "not_an_index")
    with pytest.raises(KeyError):
        preprocess.compute_index({"B04": np.zeros((1, 1), np.float32)}, "iron_oxide")


def test_required_bands_for_union():
    bands = preprocess.required_bands_for(["iron_oxide", "clay_hydroxyl"])
    assert bands == ["B04", "B02", "B11", "B12"]


def test_safe_ratio_handles_zero_denominator():
    bands = {"B04": np.array([[0.2]], np.float32), "B02": np.array([[0.0]], np.float32)}
    out = preprocess.compute_index(bands, "iron_oxide")
    assert np.isnan(out[0, 0])


def test_median_composite_ignores_nan():
    a = np.array([[1.0, np.nan]], np.float32)
    b = np.array([[3.0, 4.0]], np.float32)
    c = np.array([[5.0, np.nan]], np.float32)
    out = preprocess.median_composite([a, b, c])
    assert abs(float(out[0, 0]) - 3.0) < 1e-6  # median(1,3,5)
    assert abs(float(out[0, 1]) - 4.0) < 1e-6  # median(4) — only valid sample


def test_median_composite_all_nan_stays_nan():
    a = np.array([[np.nan]], np.float32)
    b = np.array([[np.nan]], np.float32)
    out = preprocess.median_composite([a, b])
    assert np.isnan(out[0, 0])


def test_write_cube_geotiff(tmp_path):
    import rasterio
    from rasterio.transform import from_bounds

    cube = np.random.rand(3, 4, 4).astype(np.float32)
    transform = from_bounds(-50, -20, -49.9, -19.9, 4, 4)
    profile = {"crs": "EPSG:4326", "transform": transform}
    out = tmp_path / "cube.tif"
    preprocess.write_cube_geotiff(cube, profile, ["iron_oxide", "clay_hydroxyl", "ndvi"], out)
    assert out.exists()
    with rasterio.open(out) as ds:
        assert ds.count == 3
        assert ds.descriptions[0] == "iron_oxide"
        assert ds.dtypes[0] == "float32"
