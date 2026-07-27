import { useEffect, useMemo, useRef, useState } from "react"
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  ImageOverlay,
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
  smoothOverlay: boolean
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
}: {
  url: string
  bounds: LatLngBoundsExpression
  opacity: number
  smooth: boolean
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

  return (
    <ImageOverlay
      ref={ref}
      url={displayUrl}
      bounds={bounds}
      opacity={opacity}
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
            fillOpacity: 0.08,
            weight: 2,
            opacity: 0.9,
            color: "#d8944a",
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
      const layer = L.geoJSON(customPolygon as any)
      layer.eachLayer((l) => fg.addLayer(l))
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
  smoothOverlay,
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

  // Example outlines are shown only when no custom polygon is active, as faint
  // clickable shortcuts to the article's validated sites.
  const showExamples = !customPolygon

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
            attribution='&copy; <a href="https://cloudless.eox.at">EOX</a> &mdash; <a href="https://sentinel.esa.int/web/sentinel/user-guides/sentinel-2-msi">Contains modified Copernicus Sentinel data</a>'
            url="https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg"
            maxZoom={18}
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

      {result && hasValidExtent && overlayBounds && overlayUrl && (
        <PredictionOverlay
          url={overlayUrl}
          bounds={overlayBounds}
          opacity={overlayOpacity}
          smooth={smoothOverlay}
        />
      )}
      {result && hasValidExtent && overlayBounds && showConfidence && result.confidence_uri && (
        <PredictionOverlay
          url={result.confidence_uri}
          bounds={overlayBounds}
          opacity={Math.min(1, overlayOpacity + 0.15)}
          smooth={false}
        />
      )}

      <DrawControl customPolygon={customPolygon} onPolygonDrawn={onPolygonDrawn} />
      <FlyToController flyTo={flyTo} />
      <FitBounds customPolygon={customPolygon} result={result} />
      <ViewReporter onViewChange={onViewChange} />
    </MapContainer>
    </div>
  )
}
