package backend

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func repoRoot(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	return filepath.Dir(filepath.Dir(file))
}

func TestNewRunnerListAreasAndModelDir(t *testing.T) {
	root := repoRoot(t)
	t.Setenv("GEOSENSE_APP_DIR", root)
	t.Setenv("GEOSENSE_MODEL_DIR", "")
	t.Setenv("GEOSENSE_PYTHON", "python3")
	t.Setenv("GEOSENSE_ROOT", filepath.Dir(root))

	r, err := NewRunner(root)
	if err != nil {
		t.Fatal(err)
	}
	if r.ModelDir() != filepath.Join(root, "model") {
		t.Fatalf("ModelDir=%s want %s", r.ModelDir(), filepath.Join(root, "model"))
	}
	if r.PythonPath() != "python3" {
		t.Fatalf("PythonPath=%s want python3", r.PythonPath())
	}

	areas := r.ListAreas()
	if len(areas) != 3 {
		t.Fatalf("ListAreas len=%d want 3", len(areas))
	}
	ids := map[string]bool{}
	for _, a := range areas {
		ids[a.ID] = true
		if a.Geometry.Type != "Polygon" {
			t.Fatalf("area %s geometry type=%s", a.ID, a.Geometry.Type)
		}
		if len(a.Geometry.Coordinates) == 0 || len(a.Geometry.Coordinates[0]) < 4 {
			t.Fatalf("area %s has incomplete polygon", a.ID)
		}
		if a.Bounds.LonMax <= a.Bounds.LonMin || a.Bounds.LatMax <= a.Bounds.LatMin {
			t.Fatalf("area %s has invalid bounds: %+v", a.ID, a.Bounds)
		}
	}
	for _, id := range []string{"A", "B", "C"} {
		if !ids[id] {
			t.Fatalf("missing area %s", id)
		}
		if _, ok := r.loadArea(id); !ok {
			t.Fatalf("loadArea(%s) failed", id)
		}
	}
	if _, ok := r.loadArea("Z"); ok {
		t.Fatal("loadArea(Z) should fail")
	}
}

func TestPngToDataURI(t *testing.T) {
	// 1x1 transparent PNG
	raw, err := base64.StdEncoding.DecodeString(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
	)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "pixel.png")
	if err := os.WriteFile(path, raw, 0o644); err != nil {
		t.Fatal(err)
	}
	uri, err := pngToDataURI(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(uri, "data:image/png;base64,") {
		t.Fatalf("unexpected URI prefix: %s", uri[:min(40, len(uri))])
	}
	decoded, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(uri, "data:image/png;base64,"))
	if err != nil {
		t.Fatal(err)
	}
	if len(decoded) != len(raw) {
		t.Fatalf("decoded len=%d want %d", len(decoded), len(raw))
	}
}

func TestConvertLULCNilSafe(t *testing.T) {
	if convertLULC(nil) != nil {
		t.Fatal("expected nil")
	}
	out := convertLULC(&lulcSidecarPayload{Year: 2023, Source: "test"})
	if out == nil || out.Year != 2023 {
		t.Fatalf("unexpected: %+v", out)
	}
	if out.Composition == nil || out.Groups == nil || out.PredVsRef == nil {
		t.Fatal("nil slices should be normalized to empty")
	}
}
