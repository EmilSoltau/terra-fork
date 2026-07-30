"""Unit tests for MapBiomas LULC descriptive helpers (offline)."""

from __future__ import annotations

import numpy as np

import lulc


def test_hex_to_rgb():
    assert lulc.hex_to_rgb("#006d2c") == (0, 109, 44)
    assert lulc.hex_to_rgb("4292c6") == (66, 146, 198)


def test_pixel_area_ha_positive():
    ha = lulc.pixel_area_ha((0.0001, -0.0001), lat=-25.0)
    assert ha > 0


def test_shannon_and_pielou():
    h = lulc.shannon_diversity([50.0, 50.0])
    assert abs(h - np.log(2)) < 1e-6
    assert abs(lulc.pielou_evenness(h, 2) - 1.0) < 1e-6
    assert lulc.shannon_diversity([]) == 0.0
    assert lulc.pielou_evenness(0.5, 1) == 0.0


def test_composition_from_array():
    arr = np.array([[39, 39, 3], [21, 0, 3]], dtype=np.int32)
    rows = lulc.composition_from_array(arr, px_ha=0.01)
    assert rows
    ids = {r["class_id"] for r in rows}
    assert 0 not in ids  # nodata excluded
    assert 39 in ids and 3 in ids
    assert abs(sum(r["pct"] for r in rows) - 100.0) < 0.1
    assert rows[0]["area_ha"] >= rows[-1]["area_ha"]


def test_metrics_from_composition():
    arr = np.full((10, 10), 39, dtype=np.int32)
    arr[:3, :] = 3
    composition = lulc.composition_from_array(arr, px_ha=0.01)
    metrics = lulc.metrics_from_composition(composition, area_ha=1.0, n_pixels=100)
    assert metrics["n_classes"] == 2
    assert metrics["dominant_class"]
    assert metrics["shannon_h"] > 0
    assert 0 <= metrics["pielou_j"] <= 1
    assert metrics["soja_pct"] > 0


def test_groups_from_composition():
    composition = [
        {
            "group": "Annual cropland (soybean)",
            "pct": 60.0,
            "area_ha": 6.0,
            "class_id": 39,
        },
        {
            "group": "Natural vegetation",
            "pct": 40.0,
            "area_ha": 4.0,
            "class_id": 3,
        },
    ]
    groups = lulc.groups_from_composition(composition)
    assert len(groups) == 2
    assert abs(sum(g["pct"] for g in groups) - 100.0) < 0.01
