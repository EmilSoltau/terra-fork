// Types mirroring the Go backend structs (backend/types.go). The Wails bridge
// also generates models under wailsjs/go/models.ts after `wails dev`; these
// local definitions keep the frontend readable and self-contained.

export interface Bounds {
  lon_min: number
  lat_min: number
  lon_max: number
  lat_max: number
}

export interface GeoJSONGeometry {
  type: string
  coordinates: number[][][]
}

export interface Area {
  id: string
  label: string
  kml_name: string
  approximate: boolean
  centroid: number[]
  bounds: Bounds
  mapbiomas: string
  geometry: GeoJSONGeometry
}

export type ModelKind = "spectral" | "prithvi" | "temporal_transformer"

export interface PredictRequest {
  area_id: string
  polygon_geojson: GeoJSONGeometry | null
  start: string
  end: string
  max_cloud: number
  monthly_best: boolean
  tiles: string[]
  mode: "single" | "temporal"
  model_kind: ModelKind
  prithvi_mode: "pixel" | "patch"
}

export interface ClassStat {
  class_id: number
  name: string
  color: string
  pixels: number
  pct: number
  area_ha: number
}

export interface TemporalPoint {
  date: string
  n_dates_stack: number
  soja_ndvi_mean: number | null
  soja_retention_pct: number | null
  dominant: string | null
}

export interface VISeriesPoint {
  date: string
  ndvi_mean: number
  ndvi_std: number
  evi_mean: number
  evi_std: number
  savi_mean: number
  savi_std: number
}

export interface PhenologyMetrics {
  sos_doy: number | null
  pos_doy: number | null
  eos_doy: number | null
  los_days: number | null
  peak: number | null
  base: number | null
  amplitude: number | null
}

export interface PhenologyStatePoint {
  date: string
  state: number
  state_name: string
  color: string
  ndvi_mean: number | null
}

export interface PredictResult {
  extent: Bounds
  overlay_uri: string
  confidence_uri: string
  ndvi_mean_uri: string
  reference_uri: string
  raster_tif: string
  mean_confidence: number
  n_dates: number
  date_range: string[]
  class_stats: ClassStat[]
  temporal: TemporalPoint[]
  vi_series: VISeriesPoint[]
  phenology: PhenologyMetrics
  phenology_states: PhenologyStatePoint[]
}

export interface ProgressEvent {
  progress: number
  msg: string
}

export interface GeocodeResult {
  display_name: string
  lat: number
  lon: number
  bounding_box: number[]
}

export interface User {
  id: string
  email: string
  display_name: string
  avatar_path?: string
  avatar_uri?: string
  created_at: string
  updated_at: string
}

export interface Preferences {
  user_id: string
  default_model: string
  overlay_opacity: number
  theme: string
  extras_json?: string
}

export interface InferenceRun {
  id: string
  user_id: string
  created_at: string
  model_kind: string
  period_start: string
  period_end: string
  polygon_geojson: string
  status: string
  summary: string
  result_json?: string
  overlay_relpath?: string
  assets_relpath?: string
  n_dates: number
  label?: string
}
