package backend

// Area is an embedded study-area polygon shown in the area selector.
type Area struct {
	ID          string          `json:"id"`
	Label       string          `json:"label"`
	KMLName     string          `json:"kml_name"`
	Approximate bool            `json:"approximate"`
	Centroid    []float64       `json:"centroid"`
	Bounds      Bounds          `json:"bounds"`
	MapBiomas   string          `json:"mapbiomas"`
	Geometry    GeoJSONGeometry `json:"geometry"`
}

// Bounds is the lon/lat bounding box of an area or raster.
type Bounds struct {
	LonMin float64 `json:"lon_min"`
	LatMin float64 `json:"lat_min"`
	LonMax float64 `json:"lon_max"`
	LatMax float64 `json:"lat_max"`
}

// GeoJSONGeometry is a minimal GeoJSON geometry (Polygon) passed to the sidecar.
type GeoJSONGeometry struct {
	Type        string          `json:"type"`
	Coordinates [][][]float64   `json:"coordinates"`
}

// PredictRequest is the request issued from the frontend. Imagery is fetched
// on demand from the Sentinel-2 STAC catalog (cloud COGs); no local download.
type PredictRequest struct {
	// AreaID selects an embedded area (A/B/C). Mutually exclusive with PolygonGeoJSON.
	AreaID string `json:"area_id"`
	// PolygonGeoJSON is an explicit geometry (used when AreaID is empty).
	PolygonGeoJSON *GeoJSONGeometry `json:"polygon_geojson"`
	// Start and End bound the acquisition window (YYYY-MM-DD).
	Start string `json:"start"`
	End   string `json:"end"`
	// MaxCloud is the maximum eo:cloud_cover percentage accepted (0-100).
	MaxCloud float64 `json:"max_cloud"`
	// MonthlyBest keeps only the lowest-cloud scene per month (approx. 1/month).
	MonthlyBest bool `json:"monthly_best"`
	// Tiles is an optional Sentinel-2 MGRS tile filter.
	Tiles []string `json:"tiles"`
	// Mode is "single" (full stack) or "temporal" (cumulative retention).
	Mode string `json:"mode"`
	// ModelKind is "spectral" (Random Forest on spectro-temporal features) or
	// "prithvi" (Random Forest on frozen Prithvi-EO 2.0 embeddings).
	ModelKind string `json:"model_kind"`
	// PrithviMode is "pixel" or "patch" (used when ModelKind is "prithvi").
	PrithviMode string `json:"prithvi_mode"`
}

// sidecarRequest is the JSON contract written to the Python sidecar stdin.
type sidecarRequest struct {
	ModelDir       string           `json:"model_dir"`
	Source         string           `json:"source"`
	Start          string           `json:"start,omitempty"`
	End            string           `json:"end,omitempty"`
	MaxCloud       float64          `json:"max_cloud"`
	MonthlyBest    bool             `json:"monthly_best"`
	Tiles          []string         `json:"tiles"`
	PolygonGeoJSON *GeoJSONGeometry `json:"polygon_geojson,omitempty"`
	MapBiomasPath  string           `json:"mapbiomas_path,omitempty"`
	Mode           string           `json:"mode"`
	ModelKind      string           `json:"model_kind"`
	PrithviMode    string           `json:"prithvi_mode"`
	WorkDir        string           `json:"work_dir"`
}

// ClassStat is a per-class statistic from the classification result.
type ClassStat struct {
	ClassID int     `json:"class_id"`
	Name    string  `json:"name"`
	Color   string  `json:"color"`
	Pixels  int     `json:"pixels"`
	Pct     float64 `json:"pct"`
	AreaHa  float64 `json:"area_ha"`
}

// TemporalPoint is one cumulative-stack step from temporal mode.
type TemporalPoint struct {
	Date            string   `json:"date"`
	NDatesStack     int      `json:"n_dates_stack"`
	SojaNDVIMean    *float64 `json:"soja_ndvi_mean"`
	SojaRetentionPct *float64 `json:"soja_retention_pct"`
	Dominant        *string  `json:"dominant"`
}

// sidecarResult is the raw JSON returned by the sidecar on stdout.
type sidecarResult struct {
	Extent     Bounds          `json:"extent"`
	OverlayPNG string          `json:"overlay_png"`
	RasterTIF  string          `json:"raster_tif"`
	NDates     int             `json:"n_dates"`
	DateRange  []string        `json:"date_range"`
	ClassStats []ClassStat     `json:"class_stats"`
	Temporal   []TemporalPoint `json:"temporal"`
}

// PredictResult is returned to the frontend. The overlay is delivered as a
// base64 data URI so Leaflet can render it without an asset-server path.
type PredictResult struct {
	Extent     Bounds          `json:"extent"`
	OverlayURI string          `json:"overlay_uri"`
	RasterTIF  string          `json:"raster_tif"`
	NDates     int             `json:"n_dates"`
	DateRange  []string        `json:"date_range"`
	ClassStats []ClassStat     `json:"class_stats"`
	Temporal   []TemporalPoint `json:"temporal"`
}

// ProgressEvent is emitted to the frontend as "predict:progress".
type ProgressEvent struct {
	Progress int    `json:"progress"`
	Msg      string `json:"msg"`
}
