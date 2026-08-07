package backend

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// TestExtractIntegration drives the real Go→Python→STAC pipeline end-to-end:
// it constructs a Runner backed by the repo's .venv interpreter and calls
// Extract against the live Microsoft Planetary Computer STAC catalog, asserting
// on the returned cube/index rasters, overlay, extent and coverage.
//
// It is opt-in (network + a few minutes): set TERRA_E2E=1 to run.
//
//	TERRA_E2E=1 go test ./backend/ -run TestExtractIntegration -v
func TestExtractIntegration(t *testing.T) {
	if os.Getenv("TERRA_E2E") == "" {
		t.Skip("live integration test; set TERRA_E2E=1 to run")
	}
	if testing.Short() {
		t.Skip("skipping live integration test in -short mode")
	}

	root := repoRoot(t)
	venv := filepath.Join(root, ".venv", "bin", "python")
	if _, err := os.Stat(venv); err != nil {
		t.Skipf("venv interpreter not found at %s (run: uv sync)", venv)
	}

	t.Setenv("GEOSENSE_APP_DIR", root)
	t.Setenv("GEOSENSE_PYTHON", venv)
	t.Setenv("GEOSENSE_MODEL_DIR", "")
	t.Setenv("GEOSENSE_ROOT", filepath.Dir(root))

	r, err := NewRunner(root)
	if err != nil {
		t.Fatal(err)
	}

	// Generous deadline: reads are over /vsicurl and Planetary Computer
	// throughput varies. If PC is down the sidecar's own retry gives a clear
	// error well before this fires.
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Minute)
	defer cancel()

	// Kept deliberately small (short window → ~1-2 scenes, 2 indices → 3 bands +
	// SCL) so the live test stays quick and reliable when PC is healthy.
	indices := []string{"iron_oxide", "ndvi"}
	req := ExtractRequest{
		// Small bbox over the embedded Paraná study areas — guaranteed S2 coverage.
		Bbox:        []float64{-53.56, -25.13, -53.50, -25.08},
		Start:       "2023-06-01",
		End:         "2023-07-31",
		Indices:     indices,
		MaxCloud:    30,
		MonthlyBest: true,
		MaskClouds:  true,
	}

	res, err := r.Extract(ctx, req)
	if err != nil {
		t.Fatalf("Extract failed: %v", err)
	}

	// Clean up promoted output files regardless of assertion outcome.
	t.Cleanup(func() {
		if res == nil {
			return
		}
		_ = os.Remove(res.CubeTIF)
		for _, p := range res.IndexTIFs {
			_ = os.Remove(p)
		}
		if res.ManifestJSON != "" {
			_ = os.Remove(res.ManifestJSON)
		}
	})

	if res.NScenes < 1 {
		t.Fatalf("expected >=1 contributing scene, got %d", res.NScenes)
	}
	if len(res.ScenesUsed) != res.NScenes {
		t.Fatalf("scenes_used len=%d != n_scenes=%d", len(res.ScenesUsed), res.NScenes)
	}
	if res.ValidPct <= 0 || res.ValidPct > 100 {
		t.Fatalf("valid_pct out of range: %v", res.ValidPct)
	}
	if len(res.DateRange) != 2 {
		t.Fatalf("date_range=%v want [start,end]", res.DateRange)
	}

	// Cube exists and is non-empty.
	if res.CubeTIF == "" {
		t.Fatal("empty cube_tif path")
	}
	if fi, serr := os.Stat(res.CubeTIF); serr != nil || fi.Size() == 0 {
		t.Fatalf("cube_tif missing or empty (%s): %v", res.CubeTIF, serr)
	}

	// Each requested index has a non-empty raster on disk.
	for _, name := range indices {
		p, ok := res.IndexTIFs[name]
		if !ok || p == "" {
			t.Fatalf("missing index raster for %q", name)
		}
		if fi, serr := os.Stat(p); serr != nil || fi.Size() == 0 {
			t.Fatalf("index raster %q missing or empty (%s): %v", name, p, serr)
		}
	}

	// One colormapped overlay data-URI per requested index (the map layers).
	if len(res.IndexOverlayURIs) != len(indices) {
		t.Fatalf("index_overlay_uris count=%d want %d", len(res.IndexOverlayURIs), len(indices))
	}
	for _, name := range indices {
		uri, ok := res.IndexOverlayURIs[name]
		if !ok || !strings.HasPrefix(uri, "data:image/png;base64,") {
			t.Fatalf("index %q overlay not a PNG data URI (ok=%v)", name, ok)
		}
	}

	// Overlay is an inline PNG data URI for direct map display.
	if !strings.HasPrefix(res.OverlayURI, "data:image/png;base64,") {
		snippet := res.OverlayURI
		if len(snippet) > 40 {
			snippet = snippet[:40]
		}
		t.Fatalf("overlay_uri not a PNG data URI: %q", snippet)
	}

	// Extent is a sane lon/lat box within the requested bbox neighbourhood.
	e := res.Extent
	if !(e.LonMin < e.LonMax && e.LatMin < e.LatMax) {
		t.Fatalf("degenerate extent: %+v", e)
	}
	if e.LonMin < -54 || e.LonMax > -53 || e.LatMin < -26 || e.LatMax > -25 {
		t.Fatalf("extent outside expected AOI: %+v", e)
	}

	t.Logf("extract OK: %d scenes, %.1f%% valid, dates %v, cube=%s",
		res.NScenes, res.ValidPct, res.DateRange, res.CubeTIF)
}
