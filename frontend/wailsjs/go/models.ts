export namespace backend {
	
	export class GeoJSONGeometry {
	    type: string;
	    coordinates: number[][][];
	
	    static createFrom(source: any = {}) {
	        return new GeoJSONGeometry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.coordinates = source["coordinates"];
	    }
	}
	export class Bounds {
	    lon_min: number;
	    lat_min: number;
	    lon_max: number;
	    lat_max: number;
	
	    static createFrom(source: any = {}) {
	        return new Bounds(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.lon_min = source["lon_min"];
	        this.lat_min = source["lat_min"];
	        this.lon_max = source["lon_max"];
	        this.lat_max = source["lat_max"];
	    }
	}
	export class Area {
	    id: string;
	    label: string;
	    kml_name: string;
	    approximate: boolean;
	    centroid: number[];
	    bounds: Bounds;
	    mapbiomas: string;
	    geometry: GeoJSONGeometry;
	
	    static createFrom(source: any = {}) {
	        return new Area(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.label = source["label"];
	        this.kml_name = source["kml_name"];
	        this.approximate = source["approximate"];
	        this.centroid = source["centroid"];
	        this.bounds = this.convertValues(source["bounds"], Bounds);
	        this.mapbiomas = source["mapbiomas"];
	        this.geometry = this.convertValues(source["geometry"], GeoJSONGeometry);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class ClassStat {
	    class_id: number;
	    name: string;
	    color: string;
	    pixels: number;
	    pct: number;
	    area_ha: number;
	
	    static createFrom(source: any = {}) {
	        return new ClassStat(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.class_id = source["class_id"];
	        this.name = source["name"];
	        this.color = source["color"];
	        this.pixels = source["pixels"];
	        this.pct = source["pct"];
	        this.area_ha = source["area_ha"];
	    }
	}
	
	export class GeocodeResult {
	    display_name: string;
	    lat: number;
	    lon: number;
	    bounding_box: number[];
	
	    static createFrom(source: any = {}) {
	        return new GeocodeResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.display_name = source["display_name"];
	        this.lat = source["lat"];
	        this.lon = source["lon"];
	        this.bounding_box = source["bounding_box"];
	    }
	}
	export class LULCCompareRow {
	    class_id: number;
	    name: string;
	    color: string;
	    pct_ref: number;
	    pct_pred: number;
	
	    static createFrom(source: any = {}) {
	        return new LULCCompareRow(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.class_id = source["class_id"];
	        this.name = source["name"];
	        this.color = source["color"];
	        this.pct_ref = source["pct_ref"];
	        this.pct_pred = source["pct_pred"];
	    }
	}
	export class LULCGroupRow {
	    group: string;
	    color: string;
	    pct: number;
	    area_ha: number;
	
	    static createFrom(source: any = {}) {
	        return new LULCGroupRow(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.group = source["group"];
	        this.color = source["color"];
	        this.pct = source["pct"];
	        this.area_ha = source["area_ha"];
	    }
	}
	export class LULCClassRow {
	    class_id: number;
	    name: string;
	    color: string;
	    group: string;
	    pixels: number;
	    pct: number;
	    area_ha: number;
	
	    static createFrom(source: any = {}) {
	        return new LULCClassRow(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.class_id = source["class_id"];
	        this.name = source["name"];
	        this.color = source["color"];
	        this.group = source["group"];
	        this.pixels = source["pixels"];
	        this.pct = source["pct"];
	        this.area_ha = source["area_ha"];
	    }
	}
	export class LULCMetrics {
	    area_ha: number;
	    n_pixels: number;
	    n_classes: number;
	    shannon_h: number;
	    pielou_j: number;
	    dominant_class: string;
	    dominant_pct: number;
	    soja_pct: number;
	    outras_lav_pct: number;
	    agricola_pct: number;
	
	    static createFrom(source: any = {}) {
	        return new LULCMetrics(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.area_ha = source["area_ha"];
	        this.n_pixels = source["n_pixels"];
	        this.n_classes = source["n_classes"];
	        this.shannon_h = source["shannon_h"];
	        this.pielou_j = source["pielou_j"];
	        this.dominant_class = source["dominant_class"];
	        this.dominant_pct = source["dominant_pct"];
	        this.soja_pct = source["soja_pct"];
	        this.outras_lav_pct = source["outras_lav_pct"];
	        this.agricola_pct = source["agricola_pct"];
	    }
	}
	export class LULCAnalysis {
	    year: number;
	    source: string;
	    map_uri?: string;
	    map_png?: string;
	    extent: Bounds;
	    metrics: LULCMetrics;
	    composition: LULCClassRow[];
	    groups: LULCGroupRow[];
	    pred_vs_ref: LULCCompareRow[];
	
	    static createFrom(source: any = {}) {
	        return new LULCAnalysis(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.year = source["year"];
	        this.source = source["source"];
	        this.map_uri = source["map_uri"];
	        this.map_png = source["map_png"];
	        this.extent = this.convertValues(source["extent"], Bounds);
	        this.metrics = this.convertValues(source["metrics"], LULCMetrics);
	        this.composition = this.convertValues(source["composition"], LULCClassRow);
	        this.groups = this.convertValues(source["groups"], LULCGroupRow);
	        this.pred_vs_ref = this.convertValues(source["pred_vs_ref"], LULCCompareRow);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	
	export class LULCRequest {
	    area_id: string;
	    polygon_geojson?: GeoJSONGeometry;
	    mapbiomas_path?: string;
	
	    static createFrom(source: any = {}) {
	        return new LULCRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.area_id = source["area_id"];
	        this.polygon_geojson = this.convertValues(source["polygon_geojson"], GeoJSONGeometry);
	        this.mapbiomas_path = source["mapbiomas_path"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PhenologyMetrics {
	    sos_doy?: number;
	    pos_doy?: number;
	    eos_doy?: number;
	    los_days?: number;
	    peak?: number;
	    base?: number;
	    amplitude?: number;
	
	    static createFrom(source: any = {}) {
	        return new PhenologyMetrics(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sos_doy = source["sos_doy"];
	        this.pos_doy = source["pos_doy"];
	        this.eos_doy = source["eos_doy"];
	        this.los_days = source["los_days"];
	        this.peak = source["peak"];
	        this.base = source["base"];
	        this.amplitude = source["amplitude"];
	    }
	}
	export class PhenologyStatePoint {
	    date: string;
	    state: number;
	    state_name: string;
	    color: string;
	    ndvi_mean?: number;
	
	    static createFrom(source: any = {}) {
	        return new PhenologyStatePoint(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.date = source["date"];
	        this.state = source["state"];
	        this.state_name = source["state_name"];
	        this.color = source["color"];
	        this.ndvi_mean = source["ndvi_mean"];
	    }
	}
	export class PredictRequest {
	    area_id: string;
	    polygon_geojson?: GeoJSONGeometry;
	    start: string;
	    end: string;
	    max_cloud: number;
	    monthly_best: boolean;
	    tiles: string[];
	    mode: string;
	    model_kind: string;
	    prithvi_mode: string;
	
	    static createFrom(source: any = {}) {
	        return new PredictRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.area_id = source["area_id"];
	        this.polygon_geojson = this.convertValues(source["polygon_geojson"], GeoJSONGeometry);
	        this.start = source["start"];
	        this.end = source["end"];
	        this.max_cloud = source["max_cloud"];
	        this.monthly_best = source["monthly_best"];
	        this.tiles = source["tiles"];
	        this.mode = source["mode"];
	        this.model_kind = source["model_kind"];
	        this.prithvi_mode = source["prithvi_mode"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class VISeriesPoint {
	    date: string;
	    ndvi_mean: number;
	    ndvi_std: number;
	    evi_mean: number;
	    evi_std: number;
	    savi_mean: number;
	    savi_std: number;
	
	    static createFrom(source: any = {}) {
	        return new VISeriesPoint(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.date = source["date"];
	        this.ndvi_mean = source["ndvi_mean"];
	        this.ndvi_std = source["ndvi_std"];
	        this.evi_mean = source["evi_mean"];
	        this.evi_std = source["evi_std"];
	        this.savi_mean = source["savi_mean"];
	        this.savi_std = source["savi_std"];
	    }
	}
	export class TemporalPoint {
	    date: string;
	    n_dates_stack: number;
	    soja_ndvi_mean?: number;
	    soja_retention_pct?: number;
	    dominant?: string;
	
	    static createFrom(source: any = {}) {
	        return new TemporalPoint(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.date = source["date"];
	        this.n_dates_stack = source["n_dates_stack"];
	        this.soja_ndvi_mean = source["soja_ndvi_mean"];
	        this.soja_retention_pct = source["soja_retention_pct"];
	        this.dominant = source["dominant"];
	    }
	}
	export class PredictResult {
	    extent: Bounds;
	    overlay_uri: string;
	    confidence_uri: string;
	    ndvi_mean_uri: string;
	    reference_uri: string;
	    raster_tif: string;
	    mean_confidence: number;
	    n_dates: number;
	    date_range: string[];
	    class_stats: ClassStat[];
	    temporal: TemporalPoint[];
	    vi_series: VISeriesPoint[];
	    phenology: PhenologyMetrics;
	    phenology_states: PhenologyStatePoint[];
	    lulc?: LULCAnalysis;
	
	    static createFrom(source: any = {}) {
	        return new PredictResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.extent = this.convertValues(source["extent"], Bounds);
	        this.overlay_uri = source["overlay_uri"];
	        this.confidence_uri = source["confidence_uri"];
	        this.ndvi_mean_uri = source["ndvi_mean_uri"];
	        this.reference_uri = source["reference_uri"];
	        this.raster_tif = source["raster_tif"];
	        this.mean_confidence = source["mean_confidence"];
	        this.n_dates = source["n_dates"];
	        this.date_range = source["date_range"];
	        this.class_stats = this.convertValues(source["class_stats"], ClassStat);
	        this.temporal = this.convertValues(source["temporal"], TemporalPoint);
	        this.vi_series = this.convertValues(source["vi_series"], VISeriesPoint);
	        this.phenology = this.convertValues(source["phenology"], PhenologyMetrics);
	        this.phenology_states = this.convertValues(source["phenology_states"], PhenologyStatePoint);
	        this.lulc = this.convertValues(source["lulc"], LULCAnalysis);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	

}

export namespace store {
	
	export class InferenceRun {
	    id: string;
	    user_id: string;
	    created_at: string;
	    model_kind: string;
	    period_start: string;
	    period_end: string;
	    polygon_geojson: string;
	    status: string;
	    summary: string;
	    result_json?: string;
	    overlay_relpath?: string;
	    assets_relpath?: string;
	    n_dates: number;
	    label?: string;
	
	    static createFrom(source: any = {}) {
	        return new InferenceRun(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.user_id = source["user_id"];
	        this.created_at = source["created_at"];
	        this.model_kind = source["model_kind"];
	        this.period_start = source["period_start"];
	        this.period_end = source["period_end"];
	        this.polygon_geojson = source["polygon_geojson"];
	        this.status = source["status"];
	        this.summary = source["summary"];
	        this.result_json = source["result_json"];
	        this.overlay_relpath = source["overlay_relpath"];
	        this.assets_relpath = source["assets_relpath"];
	        this.n_dates = source["n_dates"];
	        this.label = source["label"];
	    }
	}
	export class Preferences {
	    user_id: string;
	    default_model: string;
	    overlay_opacity: number;
	    theme: string;
	    extras_json?: string;
	
	    static createFrom(source: any = {}) {
	        return new Preferences(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.user_id = source["user_id"];
	        this.default_model = source["default_model"];
	        this.overlay_opacity = source["overlay_opacity"];
	        this.theme = source["theme"];
	        this.extras_json = source["extras_json"];
	    }
	}
	export class User {
	    id: string;
	    email: string;
	    display_name: string;
	    avatar_path?: string;
	    avatar_uri?: string;
	    created_at: string;
	    updated_at: string;
	
	    static createFrom(source: any = {}) {
	        return new User(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.email = source["email"];
	        this.display_name = source["display_name"];
	        this.avatar_path = source["avatar_path"];
	        this.avatar_uri = source["avatar_uri"];
	        this.created_at = source["created_at"];
	        this.updated_at = source["updated_at"];
	    }
	}

}

