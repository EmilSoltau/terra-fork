package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"geosense-infer/backend"
	"geosense-infer/backend/store"

	"github.com/google/uuid"
	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// App is the application struct bound to the frontend.
type App struct {
	ctx    context.Context
	runner *backend.Runner
	store  *store.Store

	mu           sync.RWMutex
	sessionToken string
	currentUser  *store.User
}

// NewApp creates a new App.
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts; it saves the context and builds the runner.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	wruntime.WindowMaximise(ctx)
	appDir, err := os.Getwd()
	if err != nil {
		appDir = "."
	}
	runner, err := backend.NewRunner(appDir)
	if err != nil {
		wruntime.LogError(ctx, "failed to init runner: "+err.Error())
	}
	a.runner = runner

	st, err := store.Open()
	if err != nil {
		wruntime.LogError(ctx, "failed to open user store: "+err.Error())
		return
	}
	a.store = st
	if u, token, err := st.RestoreSession(); err == nil {
		a.mu.Lock()
		a.currentUser = u
		a.sessionToken = token
		a.mu.Unlock()
	}
}

// ListEmbeddedAreas returns the embedded study areas (A/B/C).
func (a *App) ListEmbeddedAreas() []backend.Area {
	if a.runner == nil {
		return []backend.Area{}
	}
	return a.runner.ListAreas()
}

// Predict runs the inference sidecar for the given request.
func (a *App) Predict(req backend.PredictRequest) (*backend.PredictResult, error) {
	if a.runner == nil {
		return nil, errors.New("runner not initialized")
	}
	res, err := a.runner.Predict(a.ctx, req)
	if err != nil {
		return nil, err
	}
	a.persistRunIfLoggedIn(req, res)
	return res, nil
}

// ExportClassification copies the classification GeoTIFF to a user-chosen path.
func (a *App) ExportClassification(rasterPath string) (string, error) {
	if strings.TrimSpace(rasterPath) == "" {
		return "", errors.New("no raster to export")
	}
	if _, err := os.Stat(rasterPath); err != nil {
		return "", errors.New("classification raster not found (run Classify first)")
	}
	dest, err := wruntime.SaveFileDialog(a.ctx, wruntime.SaveDialogOptions{
		Title:           "Export classification GeoTIFF",
		DefaultFilename: "geosense_classification.tif",
		Filters: []wruntime.FileFilter{
			{DisplayName: "GeoTIFF", Pattern: "*.tif;*.tiff"},
		},
	})
	if err != nil {
		return "", err
	}
	if dest == "" {
		return "", nil
	}
	in, err := os.Open(rasterPath)
	if err != nil {
		return "", err
	}
	defer in.Close()
	out, err := os.Create(dest)
	if err != nil {
		return "", err
	}
	defer out.Close()
	if _, err := io.Copy(out, in); err != nil {
		return "", err
	}
	return dest, nil
}

func (a *App) persistRunIfLoggedIn(req backend.PredictRequest, res *backend.PredictResult) {
	a.persistAnalysis(req, res)
}

func (a *App) persistAnalysis(req backend.PredictRequest, res *backend.PredictResult) {
	a.mu.RLock()
	user := a.currentUser
	st := a.store
	a.mu.RUnlock()
	if st == nil || res == nil {
		return
	}
	userID := store.LocalUserID
	if user != nil {
		userID = user.ID
	}

	runID := uuid.NewString()
	assetsRel := filepath.Join("runs", runID)
	assetsDir := st.RunsDir(runID)
	_ = os.MkdirAll(assetsDir, 0o700)

	_ = store.WriteDataURIFile(res.OverlayURI, filepath.Join(assetsDir, "overlay.png"))
	_ = store.WriteDataURIFile(res.ConfidenceURI, filepath.Join(assetsDir, "confidence.png"))
	_ = store.WriteDataURIFile(res.NDVIMeanURI, filepath.Join(assetsDir, "ndvi_mean.png"))
	_ = store.WriteDataURIFile(res.ReferenceURI, filepath.Join(assetsDir, "reference.png"))
	rasterRel := ""
	if strings.TrimSpace(res.RasterTIF) != "" {
		dest := filepath.Join(assetsDir, "classification.tif")
		if err := store.WriteDataURIFile(res.RasterTIF, dest); err == nil {
			rasterRel = filepath.Join(assetsRel, "classification.tif")
		}
	}

	// Persist result without bulky data URIs; assets restored on load.
	stored := *res
	stored.OverlayURI = ""
	stored.ConfidenceURI = ""
	stored.NDVIMeanURI = ""
	stored.ReferenceURI = ""
	if rasterRel != "" {
		stored.RasterTIF = rasterRel
	} else {
		stored.RasterTIF = ""
	}
	resultBytes, _ := json.Marshal(stored)

	poly := ""
	if req.PolygonGeoJSON != nil {
		if b, err := json.Marshal(req.PolygonGeoJSON); err == nil {
			poly = string(b)
		}
	} else if req.AreaID != "" {
		poly = fmt.Sprintf(`{"area_id":%q}`, req.AreaID)
	}
	label := req.AreaID
	if label == "" {
		label = "Custom AOI"
	}
	summary, _ := json.Marshal(map[string]any{
		"class_stats":      res.ClassStats,
		"date_range":       res.DateRange,
		"n_dates":          res.NDates,
		"mean_confidence":  res.MeanConfidence,
		"area_id":          req.AreaID,
		"has_reference":    res.ReferenceURI != "",
		"has_ndvi_mean":    res.NDVIMeanURI != "",
	})

	_, _ = st.SaveRun(store.InferenceRun{
		ID:             runID,
		UserID:         userID,
		ModelKind:      req.ModelKind,
		PeriodStart:    req.Start,
		PeriodEnd:      req.End,
		PolygonGeoJSON: poly,
		Status:         "ok",
		SummaryJSON:    string(summary),
		ResultJSON:     string(resultBytes),
		OverlayRelPath: filepath.Join(assetsRel, "overlay.png"),
		AssetsRelPath:  assetsRel,
		NDates:         res.NDates,
		Label:          label,
	})
}

// ListRuns returns recent inference runs (signed-in user, or local guest).
func (a *App) ListRuns(limit int) ([]store.InferenceRun, error) {
	if err := a.requireStore(); err != nil {
		return nil, err
	}
	a.mu.RLock()
	u := a.currentUser
	a.mu.RUnlock()
	userID := store.LocalUserID
	if u != nil {
		userID = u.ID
	}
	return a.store.ListRuns(userID, limit)
}

// LoadAnalysis restores a saved PredictResult (with image data URIs) by run id.
func (a *App) LoadAnalysis(runID string) (*backend.PredictResult, error) {
	if err := a.requireStore(); err != nil {
		return nil, err
	}
	a.mu.RLock()
	u := a.currentUser
	a.mu.RUnlock()
	userID := store.LocalUserID
	if u != nil {
		userID = u.ID
	}
	run, err := a.store.GetRun(userID, runID)
	if err != nil {
		// Also try local bucket if signed-in user has no match (legacy local saves).
		if u != nil {
			run, err = a.store.GetRun(store.LocalUserID, runID)
		}
		if err != nil {
			return nil, mapStoreErr(err)
		}
	}
	var res backend.PredictResult
	if run.ResultJSON != "" && run.ResultJSON != "{}" {
		_ = json.Unmarshal([]byte(run.ResultJSON), &res)
	}
	assetsDir := a.store.RunsDir(run.ID)
	if uri, err := store.ReadFileDataURI(filepath.Join(assetsDir, "overlay.png"), "image/png"); err == nil {
		res.OverlayURI = uri
	}
	if uri, err := store.ReadFileDataURI(filepath.Join(assetsDir, "confidence.png"), "image/png"); err == nil {
		res.ConfidenceURI = uri
	}
	if uri, err := store.ReadFileDataURI(filepath.Join(assetsDir, "ndvi_mean.png"), "image/png"); err == nil {
		res.NDVIMeanURI = uri
	}
	if uri, err := store.ReadFileDataURI(filepath.Join(assetsDir, "reference.png"), "image/png"); err == nil {
		res.ReferenceURI = uri
	}
	tif := filepath.Join(assetsDir, "classification.tif")
	if _, err := os.Stat(tif); err == nil {
		res.RasterTIF = tif
	}
	if res.DateRange == nil {
		res.DateRange = []string{run.PeriodStart, run.PeriodEnd}
	}
	if res.NDates == 0 {
		res.NDates = run.NDates
	}
	return &res, nil
}

// GeocodeSearch resolves a place name to candidate locations (OSM Nominatim).
func (a *App) GeocodeSearch(query string) ([]backend.GeocodeResult, error) {
	return backend.Geocode(a.ctx, query)
}

// OpenExternal opens a URL in the system browser.
func (a *App) OpenExternal(url string) {
	wruntime.BrowserOpenURL(a.ctx, url)
}

// --- Auth / profile ---

func (a *App) requireStore() error {
	if a.store == nil {
		return errors.New("user store not available")
	}
	return nil
}

func (a *App) setSession(u *store.User, token string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.currentUser = u
	a.sessionToken = token
}

func (a *App) clearSession() {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.currentUser = nil
	a.sessionToken = ""
}

// Register creates a local account and starts a session.
func (a *App) Register(email, password, displayName string) (*store.User, error) {
	if err := a.requireStore(); err != nil {
		return nil, err
	}
	u, token, err := a.store.Register(email, password, displayName)
	if err != nil {
		return nil, mapStoreErr(err)
	}
	a.setSession(u, token)
	return u, nil
}

// Login authenticates and starts a session.
func (a *App) Login(email, password string) (*store.User, error) {
	if err := a.requireStore(); err != nil {
		return nil, err
	}
	u, token, err := a.store.Login(email, password)
	if err != nil {
		return nil, mapStoreErr(err)
	}
	a.setSession(u, token)
	return u, nil
}

// Logout ends the current session.
func (a *App) Logout() error {
	if a.store == nil {
		a.clearSession()
		return nil
	}
	a.mu.RLock()
	token := a.sessionToken
	a.mu.RUnlock()
	_ = a.store.Logout(token)
	a.clearSession()
	return nil
}

// CurrentUser returns the logged-in user, or nil.
func (a *App) CurrentUser() *store.User {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.currentUser
}

// UpdateProfile updates the display name.
func (a *App) UpdateProfile(displayName string) (*store.User, error) {
	if err := a.requireStore(); err != nil {
		return nil, err
	}
	a.mu.RLock()
	u := a.currentUser
	a.mu.RUnlock()
	if u == nil {
		return nil, store.ErrUnauthorized
	}
	updated, err := a.store.UpdateProfile(u.ID, displayName)
	if err != nil {
		return nil, mapStoreErr(err)
	}
	a.mu.Lock()
	a.currentUser = updated
	a.mu.Unlock()
	return updated, nil
}

// SetAvatar saves a profile photo from a browser data URI (data:image/...;base64,...).
func (a *App) SetAvatar(dataURI string) (*store.User, error) {
	if err := a.requireStore(); err != nil {
		return nil, err
	}
	a.mu.RLock()
	u := a.currentUser
	a.mu.RUnlock()
	if u == nil {
		return nil, store.ErrUnauthorized
	}
	updated, err := a.store.SetAvatarFromDataURI(u.ID, dataURI)
	if err != nil {
		return nil, mapStoreErr(err)
	}
	a.mu.Lock()
	a.currentUser = updated
	a.mu.Unlock()
	return updated, nil
}

// ClearAvatar removes the current user's profile photo.
func (a *App) ClearAvatar() (*store.User, error) {
	if err := a.requireStore(); err != nil {
		return nil, err
	}
	a.mu.RLock()
	u := a.currentUser
	a.mu.RUnlock()
	if u == nil {
		return nil, store.ErrUnauthorized
	}
	updated, err := a.store.ClearAvatar(u.ID)
	if err != nil {
		return nil, mapStoreErr(err)
	}
	a.mu.Lock()
	a.currentUser = updated
	a.mu.Unlock()
	return updated, nil
}

// GetPreferences returns preferences for the logged-in user.
func (a *App) GetPreferences() (*store.Preferences, error) {
	if err := a.requireStore(); err != nil {
		return nil, err
	}
	a.mu.RLock()
	u := a.currentUser
	a.mu.RUnlock()
	if u == nil {
		return nil, store.ErrUnauthorized
	}
	return a.store.GetPreferences(u.ID)
}

// SavePreferences persists preferences for the logged-in user.
func (a *App) SavePreferences(prefs store.Preferences) error {
	if err := a.requireStore(); err != nil {
		return err
	}
	a.mu.RLock()
	u := a.currentUser
	a.mu.RUnlock()
	if u == nil {
		return store.ErrUnauthorized
	}
	prefs.UserID = u.ID
	return a.store.SavePreferences(prefs)
}

func mapStoreErr(err error) error {
	switch {
	case errors.Is(err, store.ErrEmailTaken):
		return errors.New("email already registered")
	case errors.Is(err, store.ErrInvalidCreds):
		return errors.New("invalid email or password")
	case errors.Is(err, store.ErrUnauthorized):
		return errors.New("not authenticated")
	case errors.Is(err, store.ErrInvalidInput):
		return errors.New("invalid input")
	case errors.Is(err, store.ErrNotFound):
		return errors.New("not found")
	default:
		return err
	}
}
