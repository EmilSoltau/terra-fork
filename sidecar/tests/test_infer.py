"""Unit tests for vegetation indices, features, and RF smoke (offline)."""

from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np
import pytest

import infer

MODEL_DIR = Path(__file__).resolve().parents[2] / "model"


def test_calculate_ndvi_known_values():
    nir = np.array([[0.8, 0.2]], dtype=float)
    red = np.array([[0.2, 0.2]], dtype=float)
    ndvi = infer.calculate_ndvi(nir, red)
    assert ndvi.shape == (1, 2)
    assert abs(ndvi[0, 0] - 0.6) < 1e-6
    assert abs(ndvi[0, 1] - 0.0) < 1e-6


def test_calculate_ndvi_zero_denominator():
    ndvi = infer.calculate_ndvi(np.zeros((2, 2)), np.zeros((2, 2)))
    assert np.all(ndvi == 0)


def test_calculate_evi_and_savi_finite():
    nir = np.full((3, 3), 0.5)
    red = np.full((3, 3), 0.2)
    blue = np.full((3, 3), 0.1)
    evi = infer.calculate_evi(nir, red, blue)
    savi = infer.calculate_savi(nir, red)
    assert np.all(np.isfinite(evi))
    assert np.all(np.isfinite(savi))
    assert np.all((-1 <= evi) & (evi <= 1))
    assert np.all((-1 <= savi) & (savi <= 1))


def test_compute_index_features_shape():
    # 4 pixels × 6 timesteps
    ts = np.random.default_rng(0).random((4, 6))
    feat = infer.compute_index_features(ts)
    assert feat.shape == (4, 14)


def test_polygon_from_geojson():
    geom = {
        "type": "Polygon",
        "coordinates": [
            [
                [-53.54, -25.10],
                [-53.53, -25.10],
                [-53.53, -25.09],
                [-53.54, -25.09],
                [-53.54, -25.10],
            ]
        ],
    }
    poly = infer.polygon_from_geojson(geom)
    assert poly.is_valid
    assert poly.area > 0


def test_class_statistics():
    cmap = np.array([[39, 39, 3], [21, -1, 3]], dtype=np.int32)
    stats = infer.class_statistics(cmap)
    assert stats
    assert stats[0]["pixels"] >= stats[-1]["pixels"]
    total_pct = sum(s["pct"] for s in stats)
    assert abs(total_pct - 100.0) < 0.1
    ids = {s["class_id"] for s in stats}
    assert -1 not in ids


@pytest.mark.skipif(
    not (MODEL_DIR / "rf_classifier.joblib").is_file(),
    reason="trained RF artifacts not present",
)
def test_classify_from_features_rf_smoke():
    model = joblib.load(MODEL_DIR / "rf_classifier.joblib")
    scaler = joblib.load(MODEL_DIR / "scaler.joblib")
    label_encoder = joblib.load(MODEL_DIR / "label_encoder.joblib")
    feature_names = joblib.load(MODEL_DIR / "feature_names.joblib")
    n_feat = len(feature_names)
    assert n_feat == 80

    h, w = 4, 5
    valid = np.ones((h, w), dtype=bool)
    valid[0, 0] = False
    n_valid = int(valid.sum())
    rng = np.random.default_rng(42)
    # Mild random features in a plausible reflectance/index range
    X = rng.normal(loc=0.3, scale=0.1, size=(n_valid, n_feat))

    cmap, conf = infer.classify_from_features(X, valid, model, scaler, label_encoder)
    assert cmap.shape == (h, w)
    assert conf.shape == (h, w)
    assert cmap[0, 0] == -1
    preds = cmap[valid]
    assert set(preds.tolist()).issubset(set(label_encoder.classes_.tolist()))
    assert np.all(conf[valid] > 0)
    assert conf[0, 0] == 0
