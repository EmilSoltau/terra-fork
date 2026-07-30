import { useEffect, useMemo, useRef, useState } from "react"
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  ImageOverlay,
  Marker,
  LayersControl,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet"
import L from "leaflet"
// Imports "leaflet-draw" and patches the leaflet-draw 1.0.4 / leaflet 1.9.x
// touch-finish incompatibility. Must run before any L.Control.Draw is created.
import "./leafletDrawPatch"
import type { LatLngBoundsExpression } from "leaflet"
import type { Area, PredictResult, GeoJSONGeometry } from "@/lib/types"
import { majoritySmoothOverlay } from "@/lib/smoothOverlay"

interface MapViewProps {
  areas: Area[]
  activeExample: string
  customPolygon: GeoJSONGeometry | null
  onPolygonDrawn: (geom: GeoJSONGeometry | null) => void
  onSelectExample: (id: string) => void
  flyTo: { lat: number; lon: number; key: number } | null
  result: PredictResult | null
  overlayOpacity: number
  showConfidence: boolean
  /** When true (default), keep class prediction under the confidence overlay. */
  confidenceOnTop: boolean
  smoothOverlay: boolean
  areaLabel?: string
  onViewChange: (v: { lat: number; lon: number; zoom: number }) => void
}

// Report map center/zoom to the telemetry readout.
function ViewReporter({
  onViewChange,
}: {
  onViewChange: (v: { lat: number; lon: number; zoom: number }) => void
}) {
  const map = useMapEvents({
    move: () => {
      const c = map.getCenter()
      onViewChange({ lat: c.lat, lon: c.lng, zoom: map.getZoom() })
    },
    zoom: () => {
      const c = map.getCenter()
      onViewChange({ lat: c.lat, lon: c.lng, zoom: map.getZoom() })
    },
  })
  useEffect(() => {
    const c = map.getCenter()
    onViewChange({ lat: c.lat, lon: c.lng, zoom: map.getZoom() })
  }, [map, onViewChange])
  return null
}

type BasemapKind = "esri" | "eox" | "osm"

function basemapKindFromLayerName(name: string): BasemapKind {
  if (/sentinel|eox/i.test(name)) return "eox"
  if (/osm|openstreet/i.test(name) || /^map\b/i.test(name)) return "osm"
  return "esri"
}

function formatYmd(ymd: string): string {
  if (/^\d{8}$/.test(ymd)) {
    return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`
  }
  return ymd
}

/** Normalize Esri DATE (YYYYMMDD) or SRC_DATE2 (M/D/YYYY) → YYYY-MM-DD. */
function normalizeImageryDate(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (/^\d{8}$/.test(trimmed)) return formatYmd(trimmed)
  const us = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (us) {
    return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`
  }
  return trimmed
}

function dateSortKey(raw: string): string {
  const n = normalizeImageryDate(raw)
  return n ? n.replace(/-/g, "") : ""
}

/** Esri World Imagery identify → acquisition date at a map point. */
async function fetchEsriImageryDate(
  lat: number,
  lon: number,
  zoom: number,
  signal?: AbortSignal
): Promise<string | null> {
  const pad = Math.max(0.02, 180 / 2 ** Math.max(zoom, 1))
  const params = new URLSearchParams({
    f: "json",
    tolerance: "5",
    returnGeometry: "false",
    imageDisplay: "800,600,96",
    geometry: JSON.stringify({ x: lon, y: lat }),
    geometryType: "esriGeometryPoint",
    sr: "4326",
    mapExtent: `${lon - pad},${lat - pad},${lon + pad},${lat + pad}`,
    layers: "top:0",
  })
  const res = await fetch(
    `https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/identify?${params}`,
    { signal }
  )
  if (!res.ok) return null
  const data = (await res.json()) as {
    results?: Array<{
      attributes?: Record<string, string>
    }>
  }
  const results = data.results ?? []
  if (!results.length) return null

  const withLevels = results.map((r) => {
    const a = r.attributes ?? {}
    const date = a["DATE (YYYYMMDD)"] || a.SRC_DATE2 || ""
    return {
      date,
      min: Number(a.MinMapLevel ?? 0),
      max: Number(a.MaxMapLevel ?? 22),
    }
  })
  const matching = withLevels.filter((r) => zoom >= r.min && zoom <= r.max && r.date)
  const pool = matching.length ? matching : withLevels.filter((r) => r.date)
  if (!pool.length) return null

  pool.sort((a, b) => dateSortKey(b.date).localeCompare(dateSortKey(a.date)))
  return normalizeImageryDate(pool[0].date)
}

/**
 * Shows the active basemap imagery date next to the Leaflet attribution prefix.
 * Esri: acquisition date at map center (updates on pan/zoom). EOX: mosaic year.
 */
function BasemapDateAttribution() {
  const map = useMap()
  const [basemap, setBasemap] = useState<BasemapKind>("esri")
  const [dateLabel, setDateLabel] = useState<string | null>(null)

  useEffect(() => {
    const onBase = (e: L.LayersControlEvent) => {
      setBasemap(basemapKindFromLayerName(e.name))
    }
    map.on("baselayerchange", onBase)
    return () => {
      map.off("baselayerchange", onBase)
    }
  }, [map])

  useEffect(() => {
    if (basemap === "eox") {
      setDateLabel("2025")
      return
    }
    if (basemap === "osm") {
      setDateLabel(null)
      return
    }

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let abort: AbortController | undefined

    const refresh = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(async () => {
        abort?.abort()
        abort = new AbortController()
        const c = map.getCenter()
        try {
          const d = await fetchEsriImageryDate(c.lat, c.lng, map.getZoom(), abort.signal)
          if (!cancelled) setDateLabel(d)
        } catch (err) {
          if ((err as Error)?.name === "AbortError") return
          if (!cancelled) setDateLabel(null)
        }
      }, 350)
    }

    refresh()
    map.on("moveend", refresh)
    map.on("zoomend", refresh)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      abort?.abort()
      map.off("moveend", refresh)
      map.off("zoomend", refresh)
    }
  }, [map, basemap])

  useEffect(() => {
    const leaflet =
      '<a href="https://leafletjs.com" title="A JavaScript library for interactive maps">Leaflet</a>'
    const prefix = dateLabel ? `🇺🇦 ${leaflet} · ${dateLabel}` : `🇺🇦 ${leaflet}`
    map.attributionControl.setPrefix(prefix)
  }, [map, dateLabel])

  return null
}

function FlyToController({
  flyTo,
}: {
  flyTo: { lat: number; lon: number; key: number } | null
}) {
  const map = useMap()
  useEffect(() => {
    if (flyTo) map.flyTo([flyTo.lat, flyTo.lon], 14, { duration: 1.2 })
  }, [map, flyTo])
  return null
}

function FitBounds({
  customPolygon,
  result,
}: {
  customPolygon: GeoJSONGeometry | null
  result: PredictResult | null
}) {
  const map = useMap()
  useEffect(() => {
    if (result) {
      const e = result.extent
      if (
        !e ||
        (e.lon_min === 0 && e.lon_max === 0 && e.lat_min === 0 && e.lat_max === 0)
      ) {
        return
      }
      map.fitBounds(
        [
          [e.lat_min, e.lon_min],
          [e.lat_max, e.lon_max],
        ],
        { padding: [40, 40] }
      )
    }
  }, [map, customPolygon, result])
  return null
}

/**
 * Prediction ImageOverlay. Smooth = contour/isoband style (solid colors,
 * curved class boundaries via blur→argmax), not soft RGB blend.
 */
function PredictionOverlay({
  url,
  bounds,
  opacity,
  smooth,
  zIndex = 400,
}: {
  url: string
  bounds: LatLngBoundsExpression
  opacity: number
  smooth: boolean
  zIndex?: number
}) {
  const ref = useRef<L.ImageOverlay | null>(null)
  const [displayUrl, setDisplayUrl] = useState(url)

  useEffect(() => {
    let cancelled = false

    if (!smooth) {
      setDisplayUrl(url)
      return
    }

    majoritySmoothOverlay(url)
      .then((next) => {
        if (!cancelled) setDisplayUrl(next)
      })
      .catch(() => {
        if (!cancelled) setDisplayUrl(url)
      })

    return () => {
      cancelled = true
    }
  }, [url, smooth])

  useEffect(() => {
    // Always nearest-neighbor: colors stay solid; curves come from the raster.
    const applyCrisp = () => {
      const img = ref.current?.getElement()
      if (!img) return
      img.classList.add("overlay-crisp")
      img.classList.remove("overlay-smooth")
    }
    applyCrisp()
    const overlay = ref.current
    if (!overlay) return
    overlay.on("load", applyCrisp)
    return () => {
      overlay.off("load", applyCrisp)
    }
  }, [displayUrl])

  useEffect(() => {
    ref.current?.setUrl(displayUrl)
  }, [displayUrl])

  useEffect(() => {
    ref.current?.setZIndex(zIndex)
  }, [zIndex])

  return (
    <ImageOverlay
      ref={ref}
      url={displayUrl}
      bounds={bounds}
      opacity={opacity}
      zIndex={zIndex}
      className="overlay-crisp"
    />
  )
}

// leaflet-draw integration: a single-polygon draw tool with edit/clear.
function DrawControl({
  customPolygon,
  onPolygonDrawn,
}: {
  customPolygon: GeoJSONGeometry | null
  onPolygonDrawn: (geom: GeoJSONGeometry | null) => void
}) {
  const map = useMap()
  const fgRef = useRef<L.FeatureGroup | null>(null)
  const cbRef = useRef(onPolygonDrawn)
  useEffect(() => {
    cbRef.current = onPolygonDrawn
  }, [onPolygonDrawn])

  useEffect(() => {
    const drawnItems = new L.FeatureGroup()
    fgRef.current = drawnItems
    map.addLayer(drawnItems)

    const drawControl = new (L as any).Control.Draw({
      position: "bottomright",
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true,
          // Non-interactive + light fill so rubber-band guides stay visible
          // above the in-progress shape (see leafletDrawPatch guide pane).
          shapeOptions: {
            interactive: false,
            // legacy leaflet-draw default; keep false so fill never steals events
            clickable: false,
            fill: true,
            fillOpacity: 0.06,
            weight: 1.5,
            opacity: 1,
            color: "#ffffff",
          },
          icon: new L.DivIcon({
            iconSize: new L.Point(10, 10),
            className: "leaflet-div-icon leaflet-editing-icon geosense-draw-vertex",
          }),
        },
        polyline: false,
        rectangle: false,
        circle: false,
        marker: false,
        circlemarker: false,
      },
      edit: { featureGroup: drawnItems, remove: true },
    })
    map.addControl(drawControl)

    const emit = () => {
      const layers = drawnItems.getLayers()
      if (layers.length === 0) {
        cbRef.current(null)
        return
      }
      const gj = (layers[layers.length - 1] as L.Polygon).toGeoJSON()
      cbRef.current(gj.geometry as GeoJSONGeometry)
    }
    const onCreated = (e: any) => {
      drawnItems.clearLayers()
      // Hide draw stroke once finished — AoiContour paints the visible white outline above overlays.
      if (e.layer?.setStyle) {
        e.layer.setStyle({
          color: "#ffffff",
          weight: 1.5,
          opacity: 0,
          fillOpacity: 0,
        })
      }
      drawnItems.addLayer(e.layer)
      emit()
    }

    map.on((L as any).Draw.Event.CREATED, onCreated)
    map.on((L as any).Draw.Event.EDITED, emit)
    map.on((L as any).Draw.Event.DELETED, emit)

    return () => {
      map.off((L as any).Draw.Event.CREATED, onCreated)
      map.off((L as any).Draw.Event.EDITED, emit)
      map.off((L as any).Draw.Event.DELETED, emit)
      map.removeControl(drawControl)
      map.removeLayer(drawnItems)
    }
  }, [map])

  // Sync external polygon (search/import/example/clear) into the draw layer.
  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return
    const layers = fg.getLayers()
    const current =
      layers.length > 0
        ? ((layers[0] as L.Polygon).toGeoJSON().geometry as GeoJSONGeometry)
        : null
    if (JSON.stringify(current) === JSON.stringify(customPolygon)) return
    if (customPolygon) {
      fg.clearLayers()
      const layer = L.geoJSON(customPolygon as any, {
        style: {
          color: "#ffffff",
          weight: 1.5,
          opacity: 0,
          fillOpacity: 0,
        },
      })
      layer.eachLayer((l) => {
        if (l instanceof L.Path) {
          l.setStyle({
            color: "#ffffff",
            weight: 1.5,
            opacity: 0,
            fillOpacity: 0,
          })
        }
        fg.addLayer(l)
      })
      try {
        map.fitBounds(fg.getBounds(), { padding: [40, 40] })
      } catch {
        // ignore invalid bounds
      }
    } else if (layers.length > 0) {
      fg.clearLayers()
    }
  }, [map, customPolygon])

  return null
}

type LonLat = [number, number] // [lon, lat]

function polygonOuterRing(geometry: GeoJSONGeometry): LonLat[] | null {
  if (geometry.type === "Polygon") {
    return (geometry.coordinates[0] as LonLat[]) ?? null
  }
  if (geometry.type === "MultiPolygon") {
    const multi = geometry.coordinates as unknown as number[][][][]
    return (multi[0]?.[0] as LonLat[]) ?? null
  }
  return null
}

function ringCentroid(ring: LonLat[]): LonLat {
  let lon = 0
  let lat = 0
  const n = Math.max(1, ring.length - 1)
  for (let i = 0; i < ring.length - 1; i++) {
    lon += ring[i][0]
    lat += ring[i][1]
  }
  return [lon / n, lat / n]
}

/** Longest edge in the southern band of the AOI — label glues to this segment. */
function pickContourEdge(geometry: GeoJSONGeometry): {
  a: LonLat
  b: LonLat
  mid: LonLat
} | null {
  const ring = polygonOuterRing(geometry)
  if (!ring || ring.length < 2) return null

  let latMin = Infinity
  let latMax = -Infinity
  for (const [, lat] of ring) {
    if (lat < latMin) latMin = lat
    if (lat > latMax) latMax = lat
  }
  const southBand = latMin + (latMax - latMin) * 0.4

  let best: { a: LonLat; b: LonLat; mid: LonLat; score: number } | null = null
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i]
    const b = ring[i + 1]
    const mid: LonLat = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    const dlon = b[0] - a[0]
    const dlat = b[1] - a[1]
    const len = Math.hypot(dlon, dlat)
    if (len < 1e-12) continue
    // Prefer southern long edges (Wheat Field labels sit on the bottom contour).
    const southBonus = mid[1] <= southBand ? 3 : 1
    const score = len * southBonus - (mid[1] - latMin) * 0.15
    if (!best || score > best.score) {
      best = { a, b, mid, score }
    }
  }
  if (!best) return null
  return { a: best.a, b: best.b, mid: best.mid }
}

/**
 * Thin white AOI outline + name chip glued to a contour edge and rotated with it.
 */
function AoiContour({
  geometry,
  label,
}: {
  geometry: GeoJSONGeometry
  label: string
}) {
  const edge = useMemo(() => pickContourEdge(geometry), [geometry])
  const centroid = useMemo(() => {
    const ring = polygonOuterRing(geometry)
    return ring ? ringCentroid(ring) : null
  }, [geometry])

  return (
    <>
      <GeoJSON
        data={geometry as GeoJSON.Geometry}
        interactive={false}
        style={{
          color: "#ffffff",
          weight: 1.5,
          opacity: 1,
          fillOpacity: 0,
        }}
      />
      {edge && centroid && label.trim() && (
        <AoiEdgeLabel edge={edge} centroid={centroid} label={label.trim()} />
      )}
    </>
  )
}

/** Chip anchored outside a contour segment, rotated to match the edge angle. */
function AoiEdgeLabel({
  edge,
  centroid,
  label,
}: {
  edge: { a: LonLat; b: LonLat; mid: LonLat }
  centroid: LonLat
  label: string
}) {
  const map = useMap()
  const [pose, setPose] = useState<{
    position: [number, number]
    angle: number
  } | null>(null)

  const updatePose = () => {
    const p1 = map.latLngToLayerPoint(L.latLng(edge.a[1], edge.a[0]))
    const p2 = map.latLngToLayerPoint(L.latLng(edge.b[1], edge.b[0]))
    const mid = map.latLngToLayerPoint(L.latLng(edge.mid[1], edge.mid[0]))
    const c = map.latLngToLayerPoint(L.latLng(centroid[1], centroid[0]))

    let rad = Math.atan2(p2.y - p1.y, p2.x - p1.x)
    let deg = (rad * 180) / Math.PI
    // Keep text upright (readable left-to-right).
    if (deg > 90) {
      deg -= 180
      rad -= Math.PI
    } else if (deg < -90) {
      deg += 180
      rad += Math.PI
    }

    // Outward unit normal so the chip sits just outside the contour (top edge near the line).
    let nx = -Math.sin(rad)
    let ny = Math.cos(rad)
    const outX = mid.x - c.x
    const outY = mid.y - c.y
    if (outX * nx + outY * ny < 0) {
      nx = -nx
      ny = -ny
    }

    // ~half chip height — looks "glued" to the contour from outside.
    const offsetPx = 9
    const pt = L.point(mid.x + nx * offsetPx, mid.y + ny * offsetPx)
    const ll = map.layerPointToLatLng(pt)
    setPose((prev) => {
      if (
        prev &&
        Math.abs(prev.angle - deg) < 0.08 &&
        Math.abs(prev.position[0] - ll.lat) < 1e-8 &&
        Math.abs(prev.position[1] - ll.lng) < 1e-8
      ) {
        return prev
      }
      return { position: [ll.lat, ll.lng], angle: deg }
    })
  }

  useEffect(() => {
    updatePose()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh when edge/map changes
  }, [map, edge.a, edge.b, edge.mid, centroid])

  useMapEvents({
    zoom: updatePose,
    zoomend: updatePose,
    move: updatePose,
    moveend: updatePose,
    viewreset: updatePose,
  })

  const icon = useMemo(() => {
    if (!pose) return null
    const safe = label
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
    return L.divIcon({
      className: "aoi-label",
      html: `<div class="aoi-label-chip" style="transform:translate(-50%,-50%) rotate(${pose.angle}deg)">${safe}</div>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    })
  }, [label, pose])

  if (!pose || !icon) return null

  return (
    <Marker
      position={pose.position}
      icon={icon}
      interactive={false}
      zIndexOffset={600}
    />
  )
}

export function MapView({
  areas,
  activeExample,
  customPolygon,
  onPolygonDrawn,
  onSelectExample,
  flyTo,
  result,
  overlayOpacity,
  showConfidence,
  confidenceOnTop,
  smoothOverlay,
  areaLabel,
  onViewChange,
}: MapViewProps) {
  const center = useMemo<[number, number]>(() => [-14.5, -52], [])

  const overlayUrl =
    result?.overlay_uri || result?.lulc?.map_uri || result?.reference_uri || ""
  const overlayBounds: LatLngBoundsExpression | null = result
    ? [
        [result.extent.lat_min, result.extent.lon_min],
        [result.extent.lat_max, result.extent.lon_max],
      ]
    : null
  const hasValidExtent =
    !!result?.extent &&
    !(
      result.extent.lon_min === 0 &&
      result.extent.lon_max === 0 &&
      result.extent.lat_min === 0 &&
      result.extent.lat_max === 0
    )

  // Confidence is semi-transparent, so prediction always shows through unless
  // we hide it. When confidenceOnTop is off, show confidence alone.
  const showPredictionUnderConfidence = !showConfidence || confidenceOnTop
  const predictionLayer =
    result &&
    hasValidExtent &&
    overlayBounds &&
    overlayUrl &&
    showPredictionUnderConfidence ? (
      <PredictionOverlay
        key="prediction"
        url={overlayUrl}
        bounds={overlayBounds}
        opacity={overlayOpacity}
        smooth={smoothOverlay}
        zIndex={400}
      />
    ) : null

  const confidenceLayer =
    result && hasValidExtent && overlayBounds && showConfidence && result.confidence_uri ? (
      <PredictionOverlay
        key="confidence"
        url={result.confidence_uri}
        bounds={overlayBounds}
        opacity={Math.min(1, overlayOpacity + 0.15)}
        smooth={false}
        zIndex={450}
      />
    ) : null

  // Example outlines are shown only when no custom polygon is active, as faint
  // clickable shortcuts to the article's validated sites.
  const showExamples = !customPolygon

  const aoiGeometry = useMemo(() => {
    if (customPolygon) return customPolygon
    if (activeExample) {
      return areas.find((a) => a.id === activeExample)?.geometry ?? null
    }
    return null
  }, [customPolygon, activeExample, areas])

  const aoiName = useMemo(() => {
    if (areaLabel?.trim()) return areaLabel.trim()
    if (activeExample) {
      return areas.find((a) => a.id === activeExample)?.label ?? "AOI"
    }
    return customPolygon ? "Custom AOI" : ""
  }, [areaLabel, activeExample, areas, customPolygon])

  return (
    <div className="absolute inset-0">
    <MapContainer center={center} zoom={4} className="h-full w-full" zoomControl={false}>
      <ZoomControl position="bottomright" />
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Satellite (Esri)">
          <TileLayer
            attribution="Tiles &copy; Esri"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Sentinel-2 2025 (EOX)">
          <TileLayer
            attribution='&copy; <a href="https://cloudless.eox.at">EOX</a> &mdash; <a href="https://sentinel.esa.int/web/sentinel/user-guides/sentinel-2-msi">Contains modified Copernicus Sentinel data 2025</a>'
            url="https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg"
            maxNativeZoom={14}
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Map (OSM)">
          <TileLayer
            attribution="&copy; OpenStreetMap"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
      </LayersControl>

      {showExamples &&
        areas.map((area) => (
          <GeoJSON
            key={area.id}
            data={area.geometry as GeoJSON.Geometry}
            style={{
              color: activeExample === area.id ? "#22d3ee" : "#c2703d",
              weight: 1.5,
              fillOpacity: 0.04,
              dashArray: "4 3",
            }}
            eventHandlers={{ click: () => onSelectExample(area.id) }}
          />
        ))}

      {predictionLayer}
      {confidenceLayer}

      {aoiGeometry && (
        <AoiContour geometry={aoiGeometry} label={aoiName} />
      )}

      <DrawControl customPolygon={customPolygon} onPolygonDrawn={onPolygonDrawn} />
      <FlyToController flyTo={flyTo} />
      <FitBounds customPolygon={customPolygon} result={result} />
      <ViewReporter onViewChange={onViewChange} />
      <BasemapDateAttribution />
    </MapContainer>
    </div>
  )
}
