import { useEffect, useMemo, useState } from "react"
import { AnimatePresence } from "motion/react"
import { toast } from "sonner"
import {
  ListEmbeddedAreas,
  Predict,
  OpenExternal,
} from "../wailsjs/go/main/App"
import { EventsOn, EventsOff } from "../wailsjs/runtime/runtime"
import type {
  Area,
  PredictResult,
  PredictRequest,
  ProgressEvent,
  GeoJSONGeometry,
} from "@/lib/types"
import { MapView } from "@/components/MapView"
import { SearchBar } from "@/components/SearchBar"
import { ControlPanel } from "@/components/ControlPanel"
import { ResultsPanel } from "@/components/ResultsPanel"
import { TitleBar } from "@/components/TitleBar"

// Default acquisition window: the last 12 months (dynamic, not the article's
// fixed dates). The app classifies any area, so the period should follow today.
function defaultPeriod(): { start: string; end: string } {
  const now = new Date()
  const end = now.toISOString().slice(0, 10)
  const past = new Date(now)
  past.setFullYear(past.getFullYear() - 1)
  const start = past.toISOString().slice(0, 10)
  return { start, end }
}

function App() {
  const period = useMemo(defaultPeriod, [])
  const [areas, setAreas] = useState<Area[]>([])
  const [customPolygon, setCustomPolygon] = useState<GeoJSONGeometry | null>(null)
  const [activeExample, setActiveExample] = useState<string>("") // "" = own area
  const [flyTo, setFlyTo] = useState<{ lat: number; lon: number; key: number } | null>(null)
  const [view, setView] = useState<{ lat: number; lon: number; zoom: number }>({
    lat: -14.5,
    lon: -52,
    zoom: 4,
  })
  const [start, setStart] = useState<string>(period.start)
  const [end, setEnd] = useState<string>(period.end)
  const [maxCloud, setMaxCloud] = useState<number>(40)
  const [monthlyBest, setMonthlyBest] = useState<boolean>(true)
  const [mode, setMode] = useState<"single" | "temporal">("single")
  const [modelKind, setModelKind] = useState<"spectral" | "prithvi">("spectral")
  const [prithviMode, setPrithviMode] = useState<"pixel" | "patch">("pixel")
  const [overlayOpacity, setOverlayOpacity] = useState<number>(0.75)
  const [running, setRunning] = useState<boolean>(false)
  const [progress, setProgress] = useState<number>(0)
  const [progressMsg, setProgressMsg] = useState<string>("")
  const [result, setResult] = useState<PredictResult | null>(null)

  useEffect(() => {
    ListEmbeddedAreas()
      .then((a) => setAreas((a ?? []) as unknown as Area[]))
      .catch((e) => toast.error("Failed to load examples: " + e))
  }, [])

  useEffect(() => {
    EventsOn("predict:progress", (ev: ProgressEvent) => {
      if (ev.progress >= 0) setProgress(ev.progress)
      if (ev.msg) setProgressMsg(ev.msg)
    })
    return () => EventsOff("predict:progress")
  }, [])

  const hasArea = !!customPolygon || !!activeExample

  const handleLocationSelect = (lat: number, lon: number) => {
    setFlyTo({ lat, lon, key: Date.now() })
  }

  // Load an example area (A/B/C): its polygon becomes the active area.
  const handleSelectExample = (id: string) => {
    const area = areas.find((a) => a.id === id)
    if (!area) return
    setActiveExample(id)
    setCustomPolygon(area.geometry)
    setResult(null)
  }

  const clearArea = () => {
    setCustomPolygon(null)
    setActiveExample("")
  }

  const handleImportPolygon = async () => {
    try {
      const { kml } = await import("@tmcw/togeojson")
      const input = document.createElement("input")
      input.type = "file"
      input.accept = ".kml,.geojson,.json"
      input.onchange = async () => {
        const file = input.files?.[0]
        if (!file) return
        const text = await file.text()
        let geom: GeoJSONGeometry | null = null
        try {
          if (file.name.toLowerCase().endsWith(".kml")) {
            const dom = new DOMParser().parseFromString(text, "text/xml")
            const fc = kml(dom)
            const poly = fc.features.find(
              (f) => f.geometry && f.geometry.type === "Polygon"
            )
            geom = (poly?.geometry as GeoJSONGeometry) ?? null
          } else {
            const parsed = JSON.parse(text)
            if (parsed.type === "FeatureCollection") {
              geom = parsed.features.find((f: any) => f.geometry?.type === "Polygon")?.geometry ?? null
            } else if (parsed.type === "Feature") {
              geom = parsed.geometry
            } else if (parsed.type === "Polygon") {
              geom = parsed
            }
          }
        } catch (e) {
          toast.error("Invalid file: " + e)
          return
        }
        if (!geom) {
          toast.error("No polygon found in the file.")
          return
        }
        setActiveExample("")
        setCustomPolygon(geom)
        toast.success("Polygon imported.")
      }
      input.click()
    } catch (e) {
      toast.error("Import failed: " + e)
    }
  }

  const handleRun = async () => {
    if (!start || !end) {
      toast.error("Set the acquisition period.")
      return
    }
    if (!customPolygon && !activeExample) {
      toast.error("Define an area: draw, search, or load an example.")
      return
    }
    setRunning(true)
    setProgress(0)
    setProgressMsg("iniciando")
    setResult(null)
    // Embedded examples carry a MapBiomas reference (enables soja retention);
    // any other area goes through as a raw polygon with automatic tile lookup.
    const useExample = !!activeExample && !!areas.find((a) => a.id === activeExample)
    const req: PredictRequest = {
      area_id: useExample ? activeExample : "",
      polygon_geojson: useExample ? null : customPolygon,
      start,
      end,
      max_cloud: maxCloud,
      monthly_best: monthlyBest,
      tiles: [],
      mode,
      model_kind: modelKind,
      prithvi_mode: prithviMode,
    }
    try {
      const res = (await Predict(req as never)) as unknown as PredictResult
      setResult(res)
      toast.success(`Classification complete — ${res.n_dates} scenes.`)
    } catch (e) {
      toast.error("Inference error: " + e)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Solid frameless title bar with the live telemetry readout */}
      <TitleBar
        view={view}
        result={result}
        onOpenRepo={() => OpenExternal("https://github.com/rexionmars")}
      />

      {/* Map stage fills the area below the title bar */}
      <div className="relative min-h-0 flex-1">
      <MapView
        areas={areas}
        activeExample={activeExample}
        customPolygon={customPolygon}
        onPolygonDrawn={(geom) => {
          setCustomPolygon(geom)
          if (geom) setActiveExample("")
        }}
        onSelectExample={handleSelectExample}
        flyTo={flyTo}
        result={result}
        overlayOpacity={overlayOpacity}
        onViewChange={setView}
      />

      {/* Location search */}
      <SearchBar onSelectLocation={handleLocationSelect} />

      {/* Control instrument panel (left, floating) */}
      <ControlPanel
        areas={areas}
        activeExample={activeExample}
        onSelectExample={handleSelectExample}
        customPolygon={customPolygon}
        hasArea={hasArea}
        onClearArea={clearArea}
        onImportPolygon={handleImportPolygon}
        start={start}
        end={end}
        onStartChange={setStart}
        onEndChange={setEnd}
        maxCloud={maxCloud}
        onMaxCloudChange={setMaxCloud}
        monthlyBest={monthlyBest}
        onMonthlyBestChange={setMonthlyBest}
        mode={mode}
        onModeChange={setMode}
        modelKind={modelKind}
        onModelKindChange={setModelKind}
        prithviMode={prithviMode}
        onPrithviModeChange={setPrithviMode}
        overlayOpacity={overlayOpacity}
        onOpacityChange={setOverlayOpacity}
        running={running}
        progress={progress}
        progressMsg={progressMsg}
        onRun={handleRun}
      />

      {/* Results (bottom, floating) */}
      <AnimatePresence>
        {result && (
          <ResultsPanel result={result} onClose={() => setResult(null)} />
        )}
      </AnimatePresence>
      </div>
    </div>
  )
}

export default App
