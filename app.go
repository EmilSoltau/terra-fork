package main

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"sync"

	"geosense-infer/backend"
	"geosense-infer/backend/store"

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

func (a *App) persistRunIfLoggedIn(req backend.PredictRequest, res *backend.PredictResult) {
	a.mu.RLock()
	user := a.currentUser
	st := a.store
	a.mu.RUnlock()
	if user == nil || st == nil || res == nil {
		return
	}
	poly := ""
	if req.PolygonGeoJSON != nil {
		if b, err := json.Marshal(req.PolygonGeoJSON); err == nil {
			poly = string(b)
		}
	}
	summary, _ := json.Marshal(map[string]any{
		"class_stats": res.ClassStats,
		"date_range":  res.DateRange,
		"n_dates":     res.NDates,
	})
	_, _ = st.SaveRun(store.InferenceRun{
		UserID:         user.ID,
		ModelKind:      req.ModelKind,
		PeriodStart:    req.Start,
		PeriodEnd:      req.End,
		PolygonGeoJSON: poly,
		Status:         "ok",
		SummaryJSON:    string(summary),
		NDates:         res.NDates,
	})
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

// UpdateProfile updates the display name (avatarPath optional).
func (a *App) UpdateProfile(displayName, avatarPath string) (*store.User, error) {
	if err := a.requireStore(); err != nil {
		return nil, err
	}
	a.mu.RLock()
	u := a.currentUser
	a.mu.RUnlock()
	if u == nil {
		return nil, store.ErrUnauthorized
	}
	updated, err := a.store.UpdateProfile(u.ID, displayName, avatarPath)
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

// ListRuns returns recent inference runs for the logged-in user.
func (a *App) ListRuns(limit int) ([]store.InferenceRun, error) {
	if err := a.requireStore(); err != nil {
		return nil, err
	}
	a.mu.RLock()
	u := a.currentUser
	a.mu.RUnlock()
	if u == nil {
		return nil, store.ErrUnauthorized
	}
	return a.store.ListRuns(u.ID, limit)
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
