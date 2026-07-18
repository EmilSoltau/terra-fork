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

export interface PredictRequest {
  area_id: string
  polygon_geojson: GeoJSONGeometry | null
  start: string
  end: string
  max_cloud: number
  monthly_best: boolean
  tiles: string[]
  mode: "single" | "temporal"
  model_kind: "spectral" | "prithvi"
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

export interface PredictResult {
  extent: Bounds
  overlay_uri: string
  raster_tif: string
  n_dates: number
  date_range: string[]
  class_stats: ClassStat[]
  temporal: TemporalPoint[]
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
  overlay_relpath?: string
  n_dates: number
}
