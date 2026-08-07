import { forwardRef, useEffect, useMemo, useState } from "react"
import { motion } from "motion/react"
import { ChevronLeft, Play, Loader2, Layers as LayersIcon } from "lucide-react"
import { Extract } from "../../wailsjs/go/main/App"
import { EventsOn, EventsOff } from "../../wailsjs/runtime/runtime"
import type { GeoJSONGeometry, ExtractResult } from "../lib/types"

// Band-ratio indices exposed by the sidecar's preprocess.INDEX_REGISTRY.
const INDEX_OPTIONS: { key: string; label: string }[] = [
  { key: "iron_oxide", label: "Iron oxide (B04/B02)" },
  { key: "clay_hydroxyl", label: "Clay / hydroxyl (B11/B12)" },
  { key: "ferrous_iron", label: "Ferrous iron (B08/B11)" },
  { key: "carbonate", label: "Carbonate (B12/B11)" },
  { key: "ndvi", label: "NDVI (veg / quality)" },
]

type Bbox = { lonMin: number; latMin: number; lonMax: number; latMax: number }

function bboxFromPolygon(poly: GeoJSONGeometry | null): Bbox | null {
  if (!poly || poly.type !== "Polygon") return null
  const ring = poly.coordinates?.[0] as number[][] | undefined
  if (!ring || ring.length < 3) return null
  let lonMin = Infinity, latMin = Infinity, lonMax = -Infinity, latMax = -Infinity
  for (const [lon, lat] of ring) {
    lonMin = Math.min(lonMin, lon); lonMax = Math.max(lonMax, lon)
    latMin = Math.min(latMin, lat); latMax = Math.max(latMax, lat)
  }
  return { lonMin, latMin, lonMax, latMax }
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(4) : "")

export interface ExtractPanelProps {
  panelOffsetClass?: string
  polygon: GeoJSONGeometry | null
  onCollapse: () => void
  onExtractResult: (result: ExtractResult) => void
}

export const ExtractPanel = forwardRef<HTMLDivElement, ExtractPanelProps>(
  function ExtractPanel({ panelOffsetClass, polygon, onCollapse, onExtractResult }, ref) {
    const [start, setStart] = useState("2023-05-01")
    const [end, setEnd] = useState("2023-09-30")
    const [maxCloud, setMaxCloud] = useState(30)
    const [maskClouds, setMaskClouds] = useState(true)
    const [indices, setIndices] = useState<string[]>(["iron_oxide", "clay_hydroxyl", "ndvi"])
    const [running, setRunning] = useState(false)
    const [progress, setProgress] = useState(0)
    const [progressMsg, setProgressMsg] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [lastSummary, setLastSummary] = useState<string | null>(null)

    const drawnBbox = useMemo(() => bboxFromPolygon(polygon), [polygon])
    const [manual, setManual] = useState<Bbox | null>(null)
    const bbox = manual ?? drawnBbox

    const toggleIndex = (key: string) =>
      setIndices((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))

    const run = async () => {
      setError(null)
      setLastSummary(null)
      if (!bbox) return setError("Draw a rectangle AOI or enter a bbox first.")
      if (!start || !end) return setError("Set a start and end date.")
      if (indices.length === 0) return setError("Pick at least one index.")

      setRunning(true)
      setProgress(0)
      setProgressMsg("starting…")
      const off = EventsOn("predict:progress", (ev: { progress: number; msg: string }) => {
        if (typeof ev?.progress === "number" && ev.progress >= 0) setProgress(ev.progress)
        if (ev?.msg) setProgressMsg(ev.msg)
      })
      try {
        const req = {
          bbox: [bbox.lonMin, bbox.latMin, bbox.lonMax, bbox.latMax],
          polygon_geojson: null,
          start, end, bands: [], indices,
          max_cloud: maxCloud, monthly_best: true, mask_clouds: maskClouds, tiles: [],
        }
        const res = (await Extract(req as never)) as unknown as ExtractResult
        setLastSummary(`${res.n_scenes} scenes · ${res.valid_pct}% valid · ${res.indices.length} layer(s)`)
        onExtractResult(res)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setRunning(false)
        EventsOff("predict:progress")
        void off
      }
    }

    useEffect(() => () => EventsOff("predict:progress"), [])

    return (
      <motion.div
        ref={ref}
        className={`panel app-no-drag panel-scroll absolute ${panelOffsetClass ?? "left-3"} top-3 bottom-3 z-[1000] flex w-[19rem] flex-col gap-4 overflow-y-auto rounded-md p-4`}
        initial={{ opacity: 0, x: -28 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -28 }}
        transition={{ type: "spring", stiffness: 360, damping: 34 }}
      >
        <div className="flex items-center justify-between">
          <h1 className="text-sm font-semibold">Extract</h1>
          <button type="button" onClick={onCollapse} className="text-muted-foreground hover:text-foreground" title="Hide panel">
            <ChevronLeft className="size-4" />
          </button>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Draw a rectangle (bottom-right map tool) or type a bbox, then extract analysis-ready
          reflectance indices. Each index becomes a toggleable map layer in <span className="text-foreground">Layers</span>.
        </p>

        <div className="flex flex-col gap-1.5">
          <span className="eyebrow !text-foreground">Bounding box</span>
          {drawnBbox && !manual ? (
            <div className="rounded-sm bg-secondary/60 px-2 py-1.5 font-mono text-[11px] text-foreground">
              {fmt(drawnBbox.lonMin)}, {fmt(drawnBbox.latMin)} → {fmt(drawnBbox.lonMax)}, {fmt(drawnBbox.latMax)}
              <div className="text-[10px] text-muted-foreground">from drawn rectangle</div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {(["lonMin", "latMin", "lonMax", "latMax"] as const).map((k) => (
                <input
                  key={k} type="number" step="0.001" placeholder={k}
                  value={manual ? manual[k] : ""}
                  onChange={(e) => setManual((m) => ({ ...(m ?? { lonMin: 0, latMin: 0, lonMax: 0, latMax: 0 }), [k]: parseFloat(e.target.value) }))}
                  className="rounded-sm border border-border bg-secondary/40 px-1.5 py-1 font-mono text-[11px]"
                />
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setManual(manual ? null : drawnBbox ?? { lonMin: 0, latMin: 0, lonMax: 0, latMax: 0 })}
            className="self-start text-[11px] text-primary hover:underline"
          >
            {manual ? "use drawn rectangle" : "enter bbox manually"}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
            Start
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-sm border border-border bg-secondary/40 px-1.5 py-1 text-foreground" />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
            End
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded-sm border border-border bg-secondary/40 px-1.5 py-1 text-foreground" />
          </label>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="eyebrow !text-foreground">Indices</span>
          {INDEX_OPTIONS.map((opt) => (
            <label key={opt.key} className="flex items-center gap-2 text-[12px]">
              <input type="checkbox" className="accent-primary" checked={indices.includes(opt.key)} onChange={() => toggleIndex(opt.key)} />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-[12px]">
            <input type="checkbox" className="accent-primary" checked={maskClouds} onChange={(e) => setMaskClouds(e.target.checked)} />
            Mask clouds (SCL)
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            max cloud %
            <input type="number" min={0} max={100} value={maxCloud} onChange={(e) => setMaxCloud(parseFloat(e.target.value))} className="w-14 rounded-sm border border-border bg-secondary/40 px-1.5 py-1 text-foreground" />
          </label>
        </div>

        <button
          type="button" onClick={run} disabled={running}
          className="flex items-center justify-center gap-2 rounded-sm bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          {running ? "Extracting…" : "Extract"}
        </button>

        {running && (
          <div className="flex flex-col gap-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="text-[11px] text-muted-foreground">{progress}% · {progressMsg}</div>
          </div>
        )}

        {error && <div className="rounded-sm bg-destructive/15 px-2 py-1.5 text-[11px] text-destructive">{error}</div>}

        {lastSummary && !running && (
          <div className="flex items-center gap-2 rounded-sm bg-secondary/50 px-2 py-1.5 text-[11px] text-muted-foreground">
            <LayersIcon className="size-3.5 text-primary" />
            <span>{lastSummary} — see <span className="text-foreground">Layers</span> tab.</span>
          </div>
        )}
      </motion.div>
    )
  }
)
