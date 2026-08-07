package backend

import (
	"encoding/json"
	"strings"
	"testing"
)

// The sidecar defaults mask_clouds to true, so turning it OFF must serialize
// explicitly (no omitempty) or the Python side would silently re-enable it.
func TestExtractRequestMarshalsMaskCloudsFalse(t *testing.T) {
	sReq := sidecarRequest{
		Action:     "extract",
		Source:     "stac",
		Start:      "2023-05-01",
		End:        "2023-09-30",
		Bbox:       []float64{-53.56, -25.13, -53.50, -25.08},
		Bands:      []string{"B04", "B02"},
		Indices:    []string{"iron_oxide"},
		MaskClouds: false,
	}
	b, err := json.Marshal(sReq)
	if err != nil {
		t.Fatal(err)
	}
	s := string(b)
	for _, want := range []string{`"action":"extract"`, `"mask_clouds":false`, `"bbox":[`, `"indices":["iron_oxide"]`} {
		if !strings.Contains(s, want) {
			t.Fatalf("marshaled request missing %s\n got: %s", want, s)
		}
	}
}

func TestExtractResultParsesSidecarPayload(t *testing.T) {
	raw := `{"extent":{"lon_min":-53.56,"lon_max":-53.50,"lat_min":-25.13,"lat_max":-25.08},
	  "cube_tif":"/tmp/x/cube.tif","index_tifs":{"ndvi":"/tmp/x/index_ndvi.tif"},
	  "overlay_png":"/tmp/x/overlay.png","bands":["B04","B08"],"indices":["ndvi"],
	  "scenes_used":[{"id":"S2","date":"2023-05-25","cloud_cover":0.0}],
	  "n_scenes":1,"valid_pct":94.5,"date_range":["2023-05-25","2023-06-29"]}`
	var w struct {
		Extent     Bounds            `json:"extent"`
		CubeTIF    string            `json:"cube_tif"`
		IndexTIFs  map[string]string `json:"index_tifs"`
		ScenesUsed []ExtractScene    `json:"scenes_used"`
		ValidPct   float64           `json:"valid_pct"`
	}
	if err := json.Unmarshal([]byte(raw), &w); err != nil {
		t.Fatal(err)
	}
	if w.CubeTIF != "/tmp/x/cube.tif" || w.IndexTIFs["ndvi"] == "" {
		t.Fatalf("bad parse: %+v", w)
	}
	if len(w.ScenesUsed) != 1 || w.ScenesUsed[0].Date != "2023-05-25" {
		t.Fatalf("bad scenes: %+v", w.ScenesUsed)
	}
	if w.ValidPct != 94.5 || w.Extent.LonMin != -53.56 {
		t.Fatalf("bad fields: %+v", w)
	}
}
