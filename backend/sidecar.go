package backend

import (
	"bufio"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// Runner locates the repo, the Python interpreter, the model and the sidecar
// script, and runs inference requests.
type Runner struct {
	repoRoot   string // GeoSense repository root
	pythonPath string // Python interpreter (.venv/bin/python or GEOSENSE_PYTHON)
	sidecar    string // path to sidecar/infer.py
	modelDir   string // path to the trained model directory
	areasDir   string // path to embedded area GeoJSONs
}

// NewRunner resolves all required paths. appDir is the directory of the running
// geosense-infer project (where sidecar/ and areas/ live). It is resolved from
// (in order): GEOSENSE_APP_DIR, a candidate that actually contains sidecar/, or
// the provided appDir.
func NewRunner(appDir string) (*Runner, error) {
	if env := os.Getenv("GEOSENSE_APP_DIR"); env != "" {
		appDir = env
	} else {
		// When run from the project directory appDir already points at
		// geosense-infer/. When launched as a packaged binary it may not, so
		// probe the executable's directory and its parents for a sidecar/ dir.
		if _, err := os.Stat(filepath.Join(appDir, "sidecar", "infer.py")); err != nil {
			if exe, err := os.Executable(); err == nil {
				dir := filepath.Dir(exe)
				for i := 0; i < 6; i++ {
					if _, err := os.Stat(filepath.Join(dir, "sidecar", "infer.py")); err == nil {
						appDir = dir
						break
					}
					dir = filepath.Dir(dir)
				}
			}
		}
	}

	repoRoot := filepath.Dir(appDir) // geosense-infer sits inside the repo
	if env := os.Getenv("GEOSENSE_ROOT"); env != "" {
		repoRoot = env
	}

	python := os.Getenv("GEOSENSE_PYTHON")
	if python == "" {
		candidate := filepath.Join(repoRoot, ".venv", "bin", "python")
		if _, err := os.Stat(candidate); err == nil {
			python = candidate
		} else {
			python = "python3"
		}
	}

	sidecar := filepath.Join(appDir, "sidecar", "infer.py")
	areasDir := filepath.Join(appDir, "areas")

	// Model directory resolution (in order): GEOSENSE_MODEL_DIR, the bundled
	// model/ directory inside the app (self-contained repo), or the legacy
	// training-output path in the research repo.
	modelDir := os.Getenv("GEOSENSE_MODEL_DIR")
	if modelDir == "" {
		local := filepath.Join(appDir, "model")
		if _, err := os.Stat(filepath.Join(local, "rf_classifier.joblib")); err == nil {
			modelDir = local
		} else {
			modelDir = filepath.Join(repoRoot, "022026", "experiments", "output_mapbiomas", "model")
		}
	}

	r := &Runner{
		repoRoot:   repoRoot,
		pythonPath: python,
		sidecar:    sidecar,
		modelDir:   modelDir,
		areasDir:   areasDir,
	}
	return r, nil
}

// ListAreas loads the embedded area GeoJSONs (A/B/C).
func (r *Runner) ListAreas() []Area {
	areas := []Area{}
	for _, id := range []string{"A", "B", "C"} {
		path := filepath.Join(r.areasDir, id+".geojson")
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		var a Area
		if err := json.Unmarshal(data, &a); err != nil {
			continue
		}
		areas = append(areas, a)
	}
	return areas
}

// loadArea returns the embedded area by id, or false if missing.
func (r *Runner) loadArea(id string) (Area, bool) {
	for _, a := range r.ListAreas() {
		if a.ID == id {
			return a, true
		}
	}
	return Area{}, false
}

// mapbiomasPath returns the absolute path to a MapBiomas raster by file name.
func (r *Runner) mapbiomasPath(name string) string {
	if name == "" {
		return ""
	}
	p := filepath.Join(r.repoRoot, "global", "data", "mapbiomas", name)
	if _, err := os.Stat(p); err != nil {
		return ""
	}
	return p
}

// Predict runs the sidecar for the given request, emitting progress events.
func (r *Runner) Predict(ctx context.Context, req PredictRequest) (*PredictResult, error) {
	if _, err := os.Stat(r.sidecar); err != nil {
		return nil, fmt.Errorf("sidecar not found at %s", r.sidecar)
	}
	if _, err := os.Stat(r.modelDir); err != nil {
		return nil, fmt.Errorf("model directory not found at %s", r.modelDir)
	}
	if strings.TrimSpace(req.Start) == "" || strings.TrimSpace(req.End) == "" {
		return nil, fmt.Errorf("informe o periodo (data inicial e final)")
	}

	mode := req.Mode
	if mode == "" {
		mode = "single"
	}
	maxCloud := req.MaxCloud
	if maxCloud <= 0 {
		maxCloud = 100
	}
	modelKind := req.ModelKind
	if modelKind == "" {
		modelKind = "spectral"
	}
	prithviMode := req.PrithviMode
	if prithviMode == "" {
		prithviMode = "pixel"
	}

	// Resolve polygon and MapBiomas path. Embedded areas (A/B/C) use the
	// validated PR tiles and their MapBiomas reference; custom polygons leave the
	// tile filter empty so the STAC catalog returns whichever tile covers the
	// area, and have no MapBiomas reference (soja retention unavailable).
	var polygon *GeoJSONGeometry
	var mbPath string
	tiles := req.Tiles
	if req.AreaID != "" {
		area, ok := r.loadArea(req.AreaID)
		if !ok {
			return nil, fmt.Errorf("unknown area: %s", req.AreaID)
		}
		geom := area.Geometry
		polygon = &geom
		mbPath = r.mapbiomasPath(area.MapBiomas)
		if len(tiles) == 0 {
			tiles = []string{"T22JBT", "T21JZN"}
		}
	} else if req.PolygonGeoJSON != nil {
		polygon = req.PolygonGeoJSON
		// tiles stays empty -> automatic tile selection in the sidecar.
	} else {
		return nil, fmt.Errorf("no area or polygon provided")
	}

	workDir, err := os.MkdirTemp("", "geosense-run-")
	if err != nil {
		return nil, fmt.Errorf("failed to create work dir: %w", err)
	}

	sReq := sidecarRequest{
		ModelDir:       r.modelDir,
		Source:         "stac",
		Start:          req.Start,
		End:            req.End,
		MaxCloud:       maxCloud,
		MonthlyBest:    req.MonthlyBest,
		Tiles:          tiles,
		PolygonGeoJSON: polygon,
		MapBiomasPath:  mbPath,
		Mode:           mode,
		ModelKind:      modelKind,
		PrithviMode:    prithviMode,
		WorkDir:        workDir,
	}
	reqBytes, err := json.Marshal(sReq)
	if err != nil {
		return nil, fmt.Errorf("failed to encode request: %w", err)
	}

	cmd := exec.CommandContext(ctx, r.pythonPath, r.sidecar)
	cmd.Stdin = strings.NewReader(string(reqBytes))

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, err
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to start sidecar: %w", err)
	}

	var wg sync.WaitGroup
	var lastError string

	// Stream stderr: one JSON object per line ({progress,msg} or {error}).
	wg.Add(1)
	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(stderr)
		scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" {
				continue
			}
			var ev struct {
				Progress *int   `json:"progress"`
				Msg      string `json:"msg"`
				Error    string `json:"error"`
			}
			if err := json.Unmarshal([]byte(line), &ev); err != nil {
				// Non-JSON stderr (e.g. library warnings): forward as a message.
				wruntime.EventsEmit(ctx, "predict:progress", ProgressEvent{Progress: -1, Msg: line})
				continue
			}
			if ev.Error != "" {
				lastError = ev.Error
				continue
			}
			p := -1
			if ev.Progress != nil {
				p = *ev.Progress
			}
			wruntime.EventsEmit(ctx, "predict:progress", ProgressEvent{Progress: p, Msg: ev.Msg})
		}
	}()

	// Read stdout (single JSON result).
	var out strings.Builder
	wg.Add(1)
	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(stdout)
		scanner.Buffer(make([]byte, 0, 1024*1024), 16*1024*1024)
		for scanner.Scan() {
			out.WriteString(scanner.Text())
		}
	}()

	wg.Wait()
	waitErr := cmd.Wait()

	if waitErr != nil {
		if lastError != "" {
			return nil, fmt.Errorf("%s", lastError)
		}
		return nil, fmt.Errorf("sidecar failed: %w", waitErr)
	}

	raw := strings.TrimSpace(out.String())
	if raw == "" {
		if lastError != "" {
			return nil, fmt.Errorf("%s", lastError)
		}
		return nil, fmt.Errorf("sidecar produced no output")
	}

	var sres sidecarResult
	if err := json.Unmarshal([]byte(raw), &sres); err != nil {
		return nil, fmt.Errorf("failed to parse sidecar result: %w", err)
	}

	overlayURI, err := pngToDataURI(sres.OverlayPNG)
	if err != nil {
		return nil, fmt.Errorf("failed to read overlay: %w", err)
	}

	result := &PredictResult{
		Extent:     sres.Extent,
		OverlayURI: overlayURI,
		RasterTIF:  sres.RasterTIF,
		NDates:     sres.NDates,
		DateRange:  sres.DateRange,
		ClassStats: sres.ClassStats,
		Temporal:   sres.Temporal,
	}
	if result.DateRange == nil {
		result.DateRange = []string{}
	}
	if result.ClassStats == nil {
		result.ClassStats = []ClassStat{}
	}
	if result.Temporal == nil {
		result.Temporal = []TemporalPoint{}
	}
	return result, nil
}

// pngToDataURI reads a PNG file and returns a base64 data URI.
func pngToDataURI(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(data), nil
}
