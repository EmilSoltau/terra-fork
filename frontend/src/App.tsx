import { useCallback, useEffect, useMemo, useState } from "react"
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
  Preferences,
} from "@/lib/types"
import { AuthProvider, useAuth } from "@/lib/auth"
import { TitleBar } from "@/components/TitleBar"
import { AppSidebar } from "@/components/AppSidebar"
import { MapScreen } from "@/pages/MapScreen"
import { AuthPage } from "@/pages/AuthPage"
import { ProfilePage } from "@/pages/ProfilePage"
import { SettingsPage } from "@/pages/SettingsPage"

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
  const [activeExample, setActiveExample] = useState<string>("")
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

  const applyPrefs = useCallback((p: Preferences) => {
    if (p.default_model === "spectral" || p.default_model === "prithvi") {
      setModelKind(p.default_model)
    }
    if (typeof p.overlay_opacity === "number" && p.overlay_opacity > 0) {
      setOverlayOpacity(p.overlay_opacity)
    }
  }, [])

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
              geom =
                parsed.features.find(
                  (f: { geometry?: { type?: string } }) => f.geometry?.type === "Polygon"
                )?.geometry ?? null
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

  return (
    <AuthProvider onPrefsApplied={applyPrefs}>
      <AppBody
        areas={areas}
        activeExample={activeExample}
        customPolygon={customPolygon}
        flyTo={flyTo}
        view={view}
        start={start}
        end={end}
        maxCloud={maxCloud}
        monthlyBest={monthlyBest}
        mode={mode}
        modelKind={modelKind}
        prithviMode={prithviMode}
        overlayOpacity={overlayOpacity}
        running={running}
        progress={progress}
        progressMsg={progressMsg}
        result={result}
        hasArea={hasArea}
        setView={setView}
        setCustomPolygon={setCustomPolygon}
        setActiveExample={setActiveExample}
        setFlyTo={setFlyTo}
        setStart={setStart}
        setEnd={setEnd}
        setMaxCloud={setMaxCloud}
        setMonthlyBest={setMonthlyBest}
        setMode={setMode}
        setModelKind={setModelKind}
        setPrithviMode={setPrithviMode}
        setOverlayOpacity={setOverlayOpacity}
        setRunning={setRunning}
        setProgress={setProgress}
        setProgressMsg={setProgressMsg}
        setResult={setResult}
        onSelectExample={handleSelectExample}
        onClearArea={clearArea}
        onImportPolygon={handleImportPolygon}
      />
    </AuthProvider>
  )
}

function AppBody(props: {
  areas: Area[]
  activeExample: string
  customPolygon: GeoJSONGeometry | null
  flyTo: { lat: number; lon: number; key: number } | null
  view: { lat: number; lon: number; zoom: number }
  start: string
  end: string
  maxCloud: number
  monthlyBest: boolean
  mode: "single" | "temporal"
  modelKind: "spectral" | "prithvi"
  prithviMode: "pixel" | "patch"
  overlayOpacity: number
  running: boolean
  progress: number
  progressMsg: string
  result: PredictResult | null
  hasArea: boolean
  setView: (v: { lat: number; lon: number; zoom: number }) => void
  setCustomPolygon: (g: GeoJSONGeometry | null) => void
  setActiveExample: (id: string) => void
  setFlyTo: (v: { lat: number; lon: number; key: number } | null) => void
  setStart: (v: string) => void
  setEnd: (v: string) => void
  setMaxCloud: (v: number) => void
  setMonthlyBest: (v: boolean) => void
  setMode: (m: "single" | "temporal") => void
  setModelKind: (m: "spectral" | "prithvi") => void
  setPrithviMode: (m: "pixel" | "patch") => void
  setOverlayOpacity: (v: number) => void
  setRunning: (v: boolean) => void
  setProgress: (v: number) => void
  setProgressMsg: (v: string) => void
  setResult: (r: PredictResult | null) => void
  onSelectExample: (id: string) => void
  onClearArea: () => void
  onImportPolygon: () => void
}) {
  const { user, refreshRuns, screen } = useAuth()

  const handleRun = async () => {
    if (!props.start || !props.end) {
      toast.error("Set the acquisition period.")
      return
    }
    if (!props.customPolygon && !props.activeExample) {
      toast.error("Define an area: draw, search, or load an example.")
      return
    }
    props.setRunning(true)
    props.setProgress(0)
    props.setProgressMsg("iniciando")
    props.setResult(null)
    const useExample =
      !!props.activeExample && !!props.areas.find((a) => a.id === props.activeExample)
    const req: PredictRequest = {
      area_id: useExample ? props.activeExample : "",
      polygon_geojson: useExample ? null : props.customPolygon,
      start: props.start,
      end: props.end,
      max_cloud: props.maxCloud,
      monthly_best: props.monthlyBest,
      tiles: [],
      mode: props.mode,
      model_kind: props.modelKind,
      prithvi_mode: props.prithviMode,
    }
    try {
      const res = (await Predict(req as never)) as unknown as PredictResult
      props.setResult(res)
      toast.success(`Classification complete — ${res.n_dates} scenes.`)
      if (user) void refreshRuns()
    } catch (e) {
      toast.error("Inference error: " + e)
    } finally {
      props.setRunning(false)
    }
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <TitleBar view={props.view} result={props.result} />

      <div className="flex min-h-0 flex-1">
        <AppSidebar
          onOpenRepo={() => OpenExternal("https://github.com/rexionmars")}
        />
        <div className="relative min-h-0 min-w-0 flex-1">
          {screen === "map" && (
            <MapScreen
              areas={props.areas}
              activeExample={props.activeExample}
              customPolygon={props.customPolygon}
              flyTo={props.flyTo}
              result={props.result}
              overlayOpacity={props.overlayOpacity}
              hasArea={props.hasArea}
              start={props.start}
              end={props.end}
              maxCloud={props.maxCloud}
              monthlyBest={props.monthlyBest}
              mode={props.mode}
              modelKind={props.modelKind}
              prithviMode={props.prithviMode}
              running={props.running}
              progress={props.progress}
              progressMsg={props.progressMsg}
              onViewChange={props.setView}
              onPolygonDrawn={(geom) => {
                props.setCustomPolygon(geom)
                if (geom) props.setActiveExample("")
              }}
              onSelectExample={props.onSelectExample}
              onLocationSelect={(lat, lon) =>
                props.setFlyTo({ lat, lon, key: Date.now() })
              }
              onClearArea={props.onClearArea}
              onImportPolygon={props.onImportPolygon}
              onStartChange={props.setStart}
              onEndChange={props.setEnd}
              onMaxCloudChange={props.setMaxCloud}
              onMonthlyBestChange={props.setMonthlyBest}
              onModeChange={props.setMode}
              onModelKindChange={props.setModelKind}
              onPrithviModeChange={props.setPrithviMode}
              onOpacityChange={props.setOverlayOpacity}
              onRun={handleRun}
              onCloseResult={() => props.setResult(null)}
            />
          )}
          {screen === "auth" && <AuthPage />}
          {screen === "profile" && <ProfilePage />}
          {screen === "settings" && <SettingsPage />}
        </div>
      </div>
    </div>
  )
}

export default App
