import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { useTheme } from "next-themes"
import {
  ListEmbeddedAreas,
  LoadAnalysis,
  Predict,
  AnalyzeLULC,
  ListDataCube,
  OpenExternal,
  RevealMainWindow,
} from "../wailsjs/go/main/App"
import { EventsOn, EventsOff } from "../wailsjs/runtime/runtime"
import type {
  Area,
  PredictResult,
  PredictRequest,
  ProgressEvent,
  GeoJSONGeometry,
  Preferences,
  ModelKind,
  InferenceRun,
  LULCAnalysis,
  DataCubeResult,
  DataCubeRequest,
} from "@/lib/types"
import { AuthProvider, useAuth } from "@/lib/auth"
import { ThemeSync } from "@/components/ThemeSync"
import { TitleBar } from "@/components/TitleBar"
import { SplashScreen } from "@/components/SplashScreen"
import { AppSidebar } from "@/components/AppSidebar"
import { MapScreen } from "@/pages/MapScreen"
import { AuthPage } from "@/pages/AuthPage"
import { ProfilePage } from "@/pages/ProfilePage"
import { AnalysisPage } from "@/pages/AnalysisPage"

function defaultPeriod(): { start: string; end: string } {
  const now = new Date()
  const end = now.toISOString().slice(0, 10)
  const past = new Date(now)
  past.setFullYear(past.getFullYear() - 1)
  const start = past.toISOString().slice(0, 10)
  return { start, end }
}

function isModelKind(v: string): v is ModelKind {
  return v === "spectral" || v === "prithvi" || v === "temporal_transformer"
}

/** Restore AOI from a saved run's polygon_geojson (GeoJSON or {"area_id":"..."}). */
function parseRunPolygon(
  raw: string,
  areas: Area[]
): { exampleId: string; polygon: GeoJSONGeometry | null } {
  const empty = { exampleId: "", polygon: null as GeoJSONGeometry | null }
  if (!raw?.trim()) return empty
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (typeof parsed.area_id === "string") {
      const area = areas.find((a) => a.id === parsed.area_id)
      if (area) return { exampleId: area.id, polygon: area.geometry }
      return empty
    }
    if (parsed.type === "Polygon" || parsed.type === "MultiPolygon") {
      return { exampleId: "", polygon: parsed as unknown as GeoJSONGeometry }
    }
    if (parsed.type === "Feature") {
      const geom = (parsed as { geometry?: GeoJSONGeometry }).geometry
      if (geom?.type === "Polygon" || geom?.type === "MultiPolygon") {
        return { exampleId: "", polygon: geom }
      }
    }
    if (parsed.type === "FeatureCollection") {
      const features = (parsed as { features?: { geometry?: GeoJSONGeometry }[] }).features
      const geom = features?.find(
        (f) => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon"
      )?.geometry
      if (geom) return { exampleId: "", polygon: geom }
    }
  } catch {
    /* ignore malformed */
  }
  return empty
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
  const [modelKind, setModelKind] = useState<ModelKind>("spectral")
  const [prithviMode, setPrithviMode] = useState<"pixel" | "patch">("pixel")
  const [overlayOpacity, setOverlayOpacity] = useState<number>(0.75)
  const [showConfidence, setShowConfidence] = useState(false)
  const [confidenceOnTop, setConfidenceOnTop] = useState(true)
  const [smoothOverlay, setSmoothOverlay] = useState(false)
  const [running, setRunning] = useState<boolean>(false)
  const [progress, setProgress] = useState<number>(0)
  const [progressMsg, setProgressMsg] = useState<string>("")
  const [result, setResult] = useState<PredictResult | null>(null)
  const [analysisLabel, setAnalysisLabel] = useState<string | undefined>()
  const [lulcRunning, setLulcRunning] = useState(false)
  const [booting, setBooting] = useState(true)
  const [splashExiting, setSplashExiting] = useState(false)
  const { setTheme } = useTheme()

  const applyPrefs = useCallback(
    (p: Preferences) => {
      if (
        p.default_model === "spectral" ||
        p.default_model === "prithvi" ||
        p.default_model === "temporal_transformer"
      ) {
        setModelKind(p.default_model)
      }
      if (typeof p.overlay_opacity === "number" && p.overlay_opacity > 0) {
        setOverlayOpacity(p.overlay_opacity)
      }
      if (p.theme === "dark" || p.theme === "light" || p.theme === "system") {
        setTheme(p.theme)
      }
    },
    [setTheme]
  )

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

  useEffect(() => {
    let cancelled = false
    let started = false
    let exitTimer: number | undefined
    let revealTimer: number | undefined

    const finish = async () => {
      if (cancelled || started) return
      started = true
      setSplashExiting(true)
      // Match .splash-screen--exit transition (~480ms).
      exitTimer = window.setTimeout(async () => {
        if (cancelled) return
        try {
          await RevealMainWindow()
        } catch {
          /* ignore */
        }
        // Let the OS settle the maximised frame before mounting the shell.
        revealTimer = window.setTimeout(() => {
          if (!cancelled) setBooting(false)
        }, 120)
      }, 480)
    }

    EventsOn("boot:ready", finish)
    const safety = window.setTimeout(finish, 20_000)
    return () => {
      cancelled = true
      EventsOff("boot:ready")
      window.clearTimeout(safety)
      if (exitTimer) window.clearTimeout(exitTimer)
      if (revealTimer) window.clearTimeout(revealTimer)
    }
  }, [])

  const hasArea = !!customPolygon || !!activeExample

  const handleSelectExample = (id: string) => {
    const area = areas.find((a) => a.id === id)
    if (!area) return
    setActiveExample(id)
    setCustomPolygon(area.geometry)
    setResult(null)
    setAnalysisLabel(undefined)
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
      <ThemeSync />
      {booting ? (
        <SplashScreen exiting={splashExiting} />
      ) : (
        <div className="app-shell-enter h-full w-full">
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
            showConfidence={showConfidence}
            confidenceOnTop={confidenceOnTop}
            smoothOverlay={smoothOverlay}
            running={running}
            progress={progress}
            progressMsg={progressMsg}
            result={result}
            analysisLabel={analysisLabel}
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
            setShowConfidence={setShowConfidence}
            setConfidenceOnTop={setConfidenceOnTop}
            setSmoothOverlay={setSmoothOverlay}
            setRunning={setRunning}
            setProgress={setProgress}
            setProgressMsg={setProgressMsg}
            setResult={setResult}
            setAnalysisLabel={setAnalysisLabel}
            lulcRunning={lulcRunning}
            setLulcRunning={setLulcRunning}
            onSelectExample={handleSelectExample}
            onClearArea={clearArea}
            onImportPolygon={handleImportPolygon}
          />
        </div>
      )}
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
  modelKind: ModelKind
  prithviMode: "pixel" | "patch"
  overlayOpacity: number
  showConfidence: boolean
  confidenceOnTop: boolean
  smoothOverlay: boolean
  running: boolean
  progress: number
  progressMsg: string
  result: PredictResult | null
  analysisLabel?: string
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
  setModelKind: (m: ModelKind) => void
  setPrithviMode: (m: "pixel" | "patch") => void
  setOverlayOpacity: (v: number) => void
  setShowConfidence: (v: boolean) => void
  setConfidenceOnTop: (v: boolean) => void
  setSmoothOverlay: (v: boolean) => void
  setRunning: (v: boolean) => void
  setProgress: (v: number) => void
  setProgressMsg: (v: string) => void
  setResult: (r: PredictResult | null) => void
  setAnalysisLabel: (v: string | undefined) => void
  lulcRunning: boolean
  setLulcRunning: (v: boolean) => void
  onSelectExample: (id: string) => void
  onClearArea: () => void
  onImportPolygon: () => void
}) {
  const { refreshRuns, screen, goAnalysis, goMap, runs } = useAuth()
  const [loadingRun, setLoadingRun] = useState(false)
  const [dataCubeOpen, setDataCubeOpen] = useState(false)
  const [dataCubeLoading, setDataCubeLoading] = useState(false)
  const [dataCubeError, setDataCubeError] = useState<string | null>(null)
  const [dataCubeResult, setDataCubeResult] = useState<DataCubeResult | null>(null)

  const handleViewDataCube = async () => {
    if (!props.start || !props.end) {
      toast.error("Set the acquisition period.")
      return
    }
    if (!props.customPolygon && !props.activeExample) {
      toast.error("Define an area: draw, search, or load an example.")
      return
    }
    const useExample =
      !!props.activeExample && !!props.areas.find((a) => a.id === props.activeExample)
    const req: DataCubeRequest = {
      area_id: useExample ? props.activeExample : "",
      polygon_geojson: useExample ? null : props.customPolygon,
      start: props.start,
      end: props.end,
      max_cloud: props.maxCloud,
      monthly_best: props.monthlyBest,
      tiles: [],
    }
    setDataCubeOpen(true)
    setDataCubeLoading(true)
    setDataCubeError(null)
    setDataCubeResult(null)
    try {
      const res = (await ListDataCube(req as never)) as unknown as DataCubeResult
      setDataCubeResult(res)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setDataCubeError(msg)
      toast.error("Data cube error: " + msg)
    } finally {
      setDataCubeLoading(false)
    }
  }

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
      const label = useExample
        ? props.areas.find((a) => a.id === props.activeExample)?.label
        : "Custom AOI"
      props.setAnalysisLabel(label)
      toast.success(`Classification complete — ${res.n_dates} scenes (saved).`, {
        action: {
          label: "View analysis",
          onClick: () => goAnalysis(),
        },
      })
      void refreshRuns()
    } catch (e) {
      toast.error("Inference error: " + e)
    } finally {
      props.setRunning(false)
    }
  }

  const handleAnalyzeLULC = async () => {
    const useExample =
      !!props.activeExample && !!props.areas.find((a) => a.id === props.activeExample)
    if (!useExample && !props.customPolygon) {
      toast.error("Draw a polygon or select example A/B/C.")
      return
    }
    props.setLulcRunning(true)
    props.setProgress(0)
    props.setProgressMsg(
      useExample ? "analyzing MapBiomas" : "fetching MapBiomas COG"
    )
    try {
      const lulc = (await AnalyzeLULC({
        area_id: useExample ? props.activeExample : "",
        polygon_geojson: useExample ? null : props.customPolygon,
      } as never)) as unknown as LULCAnalysis
      const label = useExample
        ? props.areas.find((a) => a.id === props.activeExample)?.label
        : "Custom AOI"
      props.setAnalysisLabel(label)
      const mapUri = lulc.map_uri ?? ""
      const extent = lulc.extent ?? {
        lon_min: 0,
        lat_min: 0,
        lon_max: 0,
        lat_max: 0,
      }
      const classStats = (lulc.composition ?? []).map((c) => ({
        class_id: c.class_id,
        name: c.name,
        color: c.color,
        pixels: c.pixels,
        pct: c.pct,
        area_ha: c.area_ha,
      }))
      const emptyPheno = {
        sos_doy: null,
        pos_doy: null,
        eos_doy: null,
        los_days: null,
        peak: null,
        base: null,
        amplitude: null,
      }
      // Keep prior classification if any; otherwise expose LULC as the map overlay.
      const prev = props.result
      const keepClassification = !!prev && ((prev.n_dates ?? 0) > 0 || !!prev.overlay_uri)
      props.setResult({
        extent: keepClassification && prev ? prev.extent : extent,
        overlay_uri: keepClassification && prev?.overlay_uri ? prev.overlay_uri : mapUri,
        confidence_uri: prev?.confidence_uri ?? "",
        ndvi_mean_uri: prev?.ndvi_mean_uri ?? "",
        reference_uri: mapUri || prev?.reference_uri || "",
        raster_tif: prev?.raster_tif ?? "",
        mean_confidence: prev?.mean_confidence ?? 0,
        n_dates: prev?.n_dates ?? 0,
        date_range: prev?.date_range ?? [],
        class_stats:
          keepClassification && prev?.class_stats?.length
            ? prev.class_stats
            : classStats,
        temporal: prev?.temporal ?? [],
        vi_series: prev?.vi_series ?? [],
        phenology: prev?.phenology ?? emptyPheno,
        phenology_states: prev?.phenology_states ?? [],
        lulc,
      })
      toast.success("Land cover / land use ready on map.", {
        action: { label: "Open analysis", onClick: () => goAnalysis() },
      })
      goMap()
    } catch (e) {
      toast.error("LULC analysis error: " + e)
    } finally {
      props.setLulcRunning(false)
      props.setProgress(0)
      props.setProgressMsg("")
    }
  }

  const openSavedAnalysis = useCallback(
    async (run: InferenceRun) => {
      setLoadingRun(true)
      try {
        const res = (await LoadAnalysis(run.id)) as unknown as PredictResult
        props.setResult(res)
        if (isModelKind(run.model_kind)) props.setModelKind(run.model_kind)
        props.setAnalysisLabel(run.label || "Saved analysis")
        const aoi = parseRunPolygon(run.polygon_geojson, props.areas)
        props.setActiveExample(aoi.exampleId)
        props.setCustomPolygon(aoi.polygon)
        if (aoi.polygon?.type === "Polygon") {
          const ring = aoi.polygon.coordinates?.[0]
          if (ring?.length) {
            let lat = 0
            let lon = 0
            for (const [x, y] of ring) {
              lon += x
              lat += y
            }
            props.setFlyTo({
              lat: lat / ring.length,
              lon: lon / ring.length,
              key: Date.now(),
            })
          }
        }
        goAnalysis()
        toast.success("Analysis restored.")
      } catch (e) {
        toast.error("Could not load analysis: " + e)
      } finally {
        setLoadingRun(false)
      }
    },
    // props setters are stable from useState in parent
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      goAnalysis,
      props.areas,
      props.setResult,
      props.setModelKind,
      props.setAnalysisLabel,
      props.setActiveExample,
      props.setCustomPolygon,
      props.setFlyTo,
    ]
  )

  const backToAnalysesList = useCallback(() => {
    props.setResult(null)
    props.setAnalysisLabel(undefined)
    goAnalysis()
  }, [goAnalysis, props.setResult, props.setAnalysisLabel])

  const startNewClassification = useCallback(() => {
    props.setResult(null)
    props.setAnalysisLabel(undefined)
    props.onClearArea()
    goMap()
  }, [goMap, props.setResult, props.setAnalysisLabel, props.onClearArea])

  const areaLabel = useMemo(() => {
    if (props.analysisLabel) return props.analysisLabel
    if (props.activeExample) {
      return props.areas.find((a) => a.id === props.activeExample)?.label
    }
    return props.customPolygon ? "Custom AOI" : undefined
  }, [props.analysisLabel, props.activeExample, props.areas, props.customPolygon])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <TitleBar view={props.view} result={props.result} />

      <div className="flex min-h-0 flex-1">
        <AppSidebar
          onOpenRepo={() => OpenExternal("https://github.com/rexionmars")}
          hasAnalysis={!!props.result || runs.length > 0}
          onAnalysisClick={() => {
            if (screen === "analysis" && props.result) backToAnalysesList()
            else goAnalysis()
          }}
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
              showConfidence={props.showConfidence}
              confidenceOnTop={props.confidenceOnTop}
              smoothOverlay={props.smoothOverlay}
              areaLabel={areaLabel}
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
              onShowConfidenceChange={props.setShowConfidence}
              onConfidenceOnTopChange={props.setConfidenceOnTop}
              onSmoothOverlayChange={props.setSmoothOverlay}
              onRun={handleRun}
              onAnalyzeLULC={handleAnalyzeLULC}
              lulcRunning={props.lulcRunning}
              onCloseResult={() => {
                props.setResult(null)
                props.setAnalysisLabel(undefined)
              }}
              onNewClassification={startNewClassification}
              onViewDataCube={() => void handleViewDataCube()}
              dataCubeLoading={dataCubeLoading}
              dataCubeOpen={dataCubeOpen}
              dataCubeError={dataCubeError}
              dataCubeResult={dataCubeResult}
              onCloseDataCube={() => {
                setDataCubeOpen(false)
                setDataCubeError(null)
              }}
            />
          )}
          {screen === "analysis" && (
            <AnalysisPage
              result={props.result}
              modelKind={props.modelKind}
              areaLabel={areaLabel}
              areaId={props.activeExample || undefined}
              loadingRun={loadingRun}
              onOpenRun={openSavedAnalysis}
              onBackToList={backToAnalysesList}
              onNewClassification={startNewClassification}
            />
          )}
          {screen === "auth" && <AuthPage />}
          {screen === "profile" && (
            <ProfilePage loadingRun={loadingRun} onOpenRun={openSavedAnalysis} />
          )}
        </div>
      </div>
    </div>
  )
}

export default App
