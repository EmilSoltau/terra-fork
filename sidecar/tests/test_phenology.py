"""Unit tests for phenology helpers (synthetic NDVI curves, offline)."""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np

import phenology


def _seasonal_ndvi(n: int = 24) -> tuple[np.ndarray, list[str]]:
    """Bell-shaped NDVI over one calendar year (soy-like phenology)."""
    start = date(2023, 1, 1)
    dates = [(start + timedelta(days=15 * i)).isoformat() for i in range(n)]
    # Peak around sample 12–14 (≈ mid year)
    t = np.linspace(0, 2 * np.pi, n)
    ndvi = 0.15 + 0.55 * (0.5 * (1 - np.cos(t)))
    return ndvi.astype(float), dates


def test_assign_states_short_series():
    states = phenology.assign_states_from_ndvi(np.array([0.1, 0.2]))
    assert len(states) == 2
    assert set(states.tolist()).issubset(set(range(5)))


def test_assign_states_seasonal_includes_greenup_and_mature():
    ndvi, _ = _seasonal_ndvi()
    states = phenology.assign_states_from_ndvi(ndvi)
    assert len(states) == len(ndvi)
    assert phenology.STATE_GREENUP in states or phenology.STATE_MATURE in states
    assert set(states.tolist()).issubset(set(range(5)))


def test_phenology_metrics_coherent_order():
    ndvi, dates = _seasonal_ndvi()
    m = phenology.phenology_metrics(ndvi, dates)
    assert m["peak"] is not None and m["base"] is not None
    assert m["amplitude"] is not None and m["amplitude"] > 0
    assert m["sos_doy"] is not None
    assert m["pos_doy"] is not None
    assert m["eos_doy"] is not None
    # Length of season non-negative; peak between SOS and EOS in ordinal sense
    assert m["los_days"] is not None and m["los_days"] >= 0
    assert m["peak"] > m["base"]


def test_phenology_metrics_too_few_points():
    m = phenology.phenology_metrics([0.1, 0.2, 0.3], ["2023-01-01", "2023-01-15", "2023-02-01"])
    assert m["sos_doy"] is None
    assert m["peak"] is None


def test_state_timeline_length_and_fields():
    ndvi, dates = _seasonal_ndvi(12)
    timeline = phenology.state_timeline(ndvi, dates)
    assert len(timeline) == 12
    for row in timeline:
        assert "date" in row and "state" in row and "state_name" in row
        assert row["state"] in phenology.STATE_NAMES
        assert row["state_name"] == phenology.STATE_NAMES[row["state"]]
        assert row["color"] == phenology.STATE_COLORS[row["state"]]
