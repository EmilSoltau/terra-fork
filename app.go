package main

import (
	"context"
	"os"

	"geosense-infer/backend"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// App is the application struct bound to the frontend.
type App struct {
	ctx    context.Context
	runner *backend.Runner
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
	return a.runner.Predict(a.ctx, req)
}

// GeocodeSearch resolves a place name to candidate locations (OSM Nominatim).
func (a *App) GeocodeSearch(query string) ([]backend.GeocodeResult, error) {
	return backend.Geocode(a.ctx, query)
}

// OpenExternal opens a URL in the system browser.
func (a *App) OpenExternal(url string) {
	wruntime.BrowserOpenURL(a.ctx, url)
}
