import { useCallback, useState } from "react"
import {
  ArrowLeft,
  Columns2,
  Download,
  FolderOpen,
  History,
  Map as MapIcon,
  Plus,
} from "lucide-react"
import { notifyError, notifyExportFail, notifyExportOk } from "@/lib/notify"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import { useAuth } from "@/lib/auth"
import type { InferenceRun, PredictResult } from "@/lib/types"
import {
  ExportClassification,
  LoadAnalysis,
} from "../../wailsjs/go/main/App"
import { LulcSection } from "@/components/LulcSection"
import { CompareAnalyses } from "@/components/CompareAnalyses"
import { cn } from "@/lib/utils"

const MAPBIOMAS_LEGEND = [
  { id: 3, name: "Forest Formation", color: "#006d2c" },
  { id: 21, name: "Agri-Pasture Mosaic", color: "#fee391" },
  { id: 25, name: "Non-vegetated", color: "#d73027" },
  { id: 39, name: "Soybean", color: "#4292c6" },
  { id: 41, name: "Other temporary crops", color: "#9e9ac8" },
]

interface AnalysisPageProps {
  result: PredictResult | null
  modelKind: string
  areaLabel?: string
  areaId?: string
  loadingRun?: boolean
  onOpenRun: (run: InferenceRun) => Promise<void>
  onBackToList: () => void
  onNewClassification: () => void
}

type CompareState = {
  runA: InferenceRun
  runB: InferenceRun
  resultA: PredictResult
  resultB: PredictResult
}

export function AnalysisPage({
  result,
  modelKind,
  areaLabel,
  areaId,
  loadingRun,
  onOpenRun,
  onBackToList,
  onNewClassification,
}: AnalysisPageProps) {
  const { goMap, runs, refreshRuns } = useAuth()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [compare, setCompare] = useState<CompareState | null>(null)
  const [comparing, setComparing] = useState(false)

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 2) return [prev[1], id]
      return [...prev, id]
    })
  }, [])

  const clearSelection = useCallback(() => setSelectedIds([]), [])

  const startCompare = useCallback(async () => {
    if (selectedIds.length !== 2) return
    const runA = runs.find((r) => r.id === selectedIds[0])
    const runB = runs.find((r) => r.id === selectedIds[1])
    if (!runA || !runB) {
      notifyError("Selected analyses are no longer available")
      return
    }
    setComparing(true)
    try {
      const [resultA, resultB] = await Promise.all([
        LoadAnalysis(runA.id) as unknown as Promise<PredictResult>,
        LoadAnalysis(runB.id) as unknown as Promise<PredictResult>,
      ])
      setCompare({ runA, runB, resultA, resultB })
    } catch (e) {
      notifyError("Compare failed", e)
    } finally {
      setComparing(false)
    }
  }, [runs, selectedIds])

  const exitCompare = useCallback(() => {
    setCompare(null)
  }, [])

  const swapCompare = useCallback(() => {
    setCompare((prev) => {
      if (!prev) return prev
      return {
        runA: prev.runB,
        runB: prev.runA,
        resultA: prev.resultB,
        resultB: prev.resultA,
      }
    })
  }, [])

  if (compare) {
    return (
      <CompareAnalyses
        runA={compare.runA}
        runB={compare.runB}
        resultA={compare.resultA}
        resultB={compare.resultB}
        onBack={exitCompare}
        onSwap={swapCompare}
      />
    )
  }

  const runsPanel = (
    <SavedRunsPanel
      runs={runs}
      loading={!!loadingRun || comparing}
      selectedIds={selectedIds}
      onToggleSelect={toggleSelect}
      onClearSelection={clearSelection}
      onCompare={() => void startCompare()}
      comparing={comparing}
      onOpen={onOpenRun}
      onRefresh={() => void refreshRuns()}
    />
  )

  if (!result) {
    return (
      <div className="app-no-drag flex h-full min-h-0 flex-col overflow-y-auto bg-background">
        <div className="flex w-full flex-col gap-6 px-5 py-7 sm:px-6 lg:px-8 xl:px-10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 max-w-xl">
              <p className="telemetry text-[10px] text-primary">ANALYSIS</p>
              <h1 className="mt-1 font-display text-xl font-semibold tracking-wide xl:text-2xl">
                Saved analyses
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Open a saved run, or select two to compare. Results persist locally
                after you close the app.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onNewClassification}
                className="flex h-9 items-center gap-1.5 rounded-sm bg-primary px-4 text-xs font-semibold text-primary-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                New classification
              </button>
              <button
                type="button"
                onClick={goMap}
                className="flex h-9 items-center gap-1.5 rounded-sm border border-border px-4 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <MapIcon className="h-3.5 w-3.5" />
                Go to map
              </button>
            </div>
          </div>
          {runsPanel}
        </div>
      </div>
    )
  }

  const viSeries = result.vi_series ?? []
  const states = result.phenology_states ?? []
  const pheno = result.phenology
  const lulc = result.lulc
  const hasClassification = (result.n_dates ?? 0) > 0 || !!result.overlay_uri
  const viChart = viSeries.map((p) => ({
    date: p.date,
    ndvi: p.ndvi_mean,
    evi: p.evi_mean,
    savi: p.savi_mean,
  }))
  const modelLabel =
    modelKind === "temporal_transformer"
      ? "Temporal Transformer"
      : modelKind === "prithvi"
        ? "Prithvi-EO 2.0"
        : "Random Forest"

  const exportTif = async () => {
    if (!result.raster_tif) return
    try {
      const dest = await ExportClassification(result.raster_tif)
      if (dest) notifyExportOk(dest)
    } catch (e) {
      notifyExportFail(e)
    }
  }

  const metric = (label: string, value: number | null | undefined, suffix = "") => (
    <div className="rounded-sm border border-border/60 bg-secondary/20 px-2 py-1.5">
      <div className="eyebrow">{label}</div>
      <div className="telemetry mt-0.5 text-[12px] text-foreground">
        {value == null ? "—" : `${Number(value).toFixed(value % 1 === 0 ? 0 : 2)}${suffix}`}
      </div>
    </div>
  )

  return (
    <div className="app-no-drag flex h-full min-h-0 flex-col overflow-y-auto bg-background">
      <div className="flex w-full flex-col gap-6 px-5 py-7 sm:px-6 lg:px-8 xl:px-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="telemetry text-[10px] text-primary">ANALYSIS</p>
            <h1 className="mt-1 font-display text-xl font-semibold tracking-wide xl:text-2xl">
              {hasClassification ? "Cover map" : "Land cover / land use"}
              {areaLabel ? ` — ${areaLabel}` : ""}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {hasClassification ? (
                <>
                  {result.n_dates} scenes · {result.date_range[0]} → {result.date_range[1]} ·{" "}
                  {modelLabel}
                  {result.mean_confidence > 0 && (
                    <> · mean conf {(result.mean_confidence * 100).toFixed(0)}%</>
                  )}
                </>
              ) : (
                <>MapBiomas descriptive analysis · no Sentinel classification</>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onBackToList}
              className="flex h-8 items-center gap-1.5 rounded-sm border border-border px-3 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" />
              Saved analyses
            </button>
            <button
              type="button"
              onClick={goMap}
              className="flex h-8 items-center gap-1.5 rounded-sm border border-border px-3 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <MapIcon className="h-3 w-3" />
              View on map
            </button>
            <button
              type="button"
              onClick={onNewClassification}
              className="flex h-8 items-center gap-1.5 rounded-sm border border-border px-3 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <Plus className="h-3 w-3" />
              New classification
            </button>
            {hasClassification && result.raster_tif && (
              <button
                type="button"
                onClick={() => void exportTif()}
                className="flex h-8 items-center gap-1.5 rounded-sm bg-primary px-3 text-[11px] font-semibold text-primary-foreground"
              >
                <Download className="h-3 w-3" />
                Export GeoTIFF
              </button>
            )}
          </div>
        </div>

        {lulc && (
          <LulcSection lulc={lulc} areaId={areaId} areaLabel={areaLabel} />
        )}

        {hasClassification && (
        <section className="rounded-md border border-border bg-card/40 p-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <PanelTile
              title="NDVI (temporal mean)"
              uri={result.ndvi_mean_uri}
              empty="NDVI mean unavailable"
            />
            <PanelTile
              title="MapBiomas reference"
              uri={result.reference_uri}
              empty="No MapBiomas for this AOI"
            />
            <PanelTile
              title={`Predicted · ${modelLabel}`}
              uri={result.overlay_uri}
              empty="No prediction"
            />
            <PanelTile
              title="Confidence"
              uri={result.confidence_uri}
              empty="No confidence map"
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-3 border-t border-border/60 pt-3">
            {MAPBIOMAS_LEGEND.map((c) => (
              <span key={c.id} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="size-2.5 rounded-[2px]" style={{ backgroundColor: c.color }} />
                {c.id}: {c.name}
              </span>
            ))}
          </div>
        </section>
        )}

        {(hasClassification && result.class_stats?.length > 0) || viChart.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-stretch">
            {hasClassification && result.class_stats?.length > 0 && (
            <section className="rounded-md border border-border bg-card/40 p-5">
              <p className="eyebrow mb-3">Predicted class distribution</p>
              <ul className="flex flex-col gap-1.5">
                {result.class_stats.map((s) => (
                  <li key={s.class_id} className="flex items-center gap-2 text-xs">
                    <span
                      className="size-2.5 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="w-40 shrink-0 truncate sm:w-44">{s.name}</span>
                    <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                      <span
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{ width: `${s.pct}%`, backgroundColor: s.color }}
                      />
                    </span>
                    <span className="telemetry w-12 shrink-0 text-right">{s.pct.toFixed(1)}%</span>
                    <span className="telemetry w-16 shrink-0 text-right text-muted-foreground">
                      {s.area_ha.toFixed(1)} ha
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            )}

            {viChart.length > 0 && (
              <section className="rounded-md border border-border bg-card/40 p-5">
                <p className="eyebrow mb-3">Vegetation indices · AOI mean</p>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={viChart} margin={{ top: 5, right: 12, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="var(--hairline)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                      tickFormatter={(d: string) => d.slice(2, 7)}
                      interval="preserveStartEnd"
                      minTickGap={24}
                    />
                    <YAxis domain={[-0.1, 1]} tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 4,
                        fontSize: 11,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line type="monotone" dataKey="ndvi" name="NDVI" stroke="#22c55e" strokeWidth={1.8} dot={false} />
                    <Line type="monotone" dataKey="evi" name="EVI" stroke="#38bdf8" strokeWidth={1.8} dot={false} />
                    <Line type="monotone" dataKey="savi" name="SAVI" stroke="#f59e0b" strokeWidth={1.8} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </section>
            )}
          </div>
        ) : null}

        {(pheno && hasClassification) || states.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-stretch">
            {pheno && hasClassification && (
              <section className="rounded-md border border-border bg-card/40 p-5">
                <p className="eyebrow mb-3">Phenology metrics · AOI NDVI</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7 xl:grid-cols-4 2xl:grid-cols-7">
                  {metric("SOS", pheno.sos_doy, " d")}
                  {metric("POS", pheno.pos_doy, " d")}
                  {metric("EOS", pheno.eos_doy, " d")}
                  {metric("LOS", pheno.los_days, " d")}
                  {metric("Peak", pheno.peak)}
                  {metric("Base", pheno.base)}
                  {metric("Amp", pheno.amplitude)}
                </div>
              </section>
            )}

            {states.length > 0 && (
              <section className="rounded-md border border-border bg-card/40 p-5">
                <p className="eyebrow mb-3">Phenological state timeline</p>
                <div className="edge-fade-x -mx-1 overflow-x-auto px-1">
                  <div className="flex min-w-0 gap-1">
                    {states.map((s) => (
                      <div
                        key={s.date}
                        title={`${s.date}: ${s.state_name}${s.ndvi_mean != null ? ` · NDVI ${s.ndvi_mean}` : ""}`}
                        className="flex min-w-[2.25rem] flex-1 flex-col items-center gap-0.5"
                      >
                        <span
                          className="h-3 w-full rounded-sm"
                          style={{ backgroundColor: s.color }}
                        />
                        <span className="telemetry text-[8px] text-place">{s.date.slice(5)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                  {[
                    ["#8c510a", "Bare / low"],
                    ["#66c2a5", "Green-up"],
                    ["#006d2c", "Peak"],
                    ["#fdae61", "Senescence"],
                    ["#bdbdbd", "Fallow"],
                  ].map(([c, n]) => (
                    <span key={n} className="flex items-center gap-1">
                      <span className="size-2 rounded-[2px]" style={{ backgroundColor: c }} />
                      {n}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : null}

        {runsPanel}
      </div>
    </div>
  )
}

function SavedRunsPanel({
  runs,
  loading,
  selectedIds,
  onToggleSelect,
  onClearSelection,
  onCompare,
  comparing,
  onOpen,
  onRefresh,
}: {
  runs: InferenceRun[]
  loading: boolean
  selectedIds: string[]
  onToggleSelect: (id: string) => void
  onClearSelection: () => void
  onCompare: () => void
  comparing: boolean
  onOpen: (run: InferenceRun) => Promise<void>
  onRefresh: () => void
}) {
  const canCompare = selectedIds.length === 2 && !comparing

  return (
    <section className="rounded-md border border-border bg-card/40 p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <History className="h-3.5 w-3.5 text-primary" />
          <p className="eyebrow !text-foreground">Saved analyses</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={onClearSelection}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              Clear selection
            </button>
          )}
          <button
            type="button"
            onClick={onRefresh}
            className="text-[10px] text-muted-foreground hover:text-foreground"
          >
            Refresh
          </button>
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-sm border border-border/60 bg-secondary/25 px-3 py-2">
          <p className="text-[11px] text-muted-foreground">
            {selectedIds.length === 1
              ? "Select one more analysis to compare"
              : "Two analyses selected"}
          </p>
          <button
            type="button"
            disabled={!canCompare}
            onClick={onCompare}
            className="flex h-8 items-center gap-1.5 rounded-sm bg-primary px-3 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
          >
            <Columns2 className="h-3 w-3" />
            {comparing ? "Loading…" : "Compare"}
          </button>
        </div>
      )}

      {runs.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No saved analyses yet. Classify an AOI on the map — results are stored locally.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {runs.map((r) => {
            const selected = selectedIds.includes(r.id)
            const slot =
              selectedIds[0] === r.id ? "A" : selectedIds[1] === r.id ? "B" : null
            return (
              <li
                key={r.id}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-sm border px-3 py-2.5 text-xs",
                  selected
                    ? "border-primary/60 bg-primary/10"
                    : "border-border/60 bg-secondary/30"
                )}
              >
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={loading}
                    onChange={() => onToggleSelect(r.id)}
                    className="mt-0.5 accent-primary"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {slot && (
                        <span className="telemetry shrink-0 rounded-sm bg-primary/20 px-1 text-[9px] text-primary">
                          {slot}
                        </span>
                      )}
                      <span className="truncate font-medium text-foreground">
                        {r.label || r.model_kind}
                      </span>
                      <span className="telemetry shrink-0 text-muted-foreground">
                        {r.n_dates} scenes
                      </span>
                    </div>
                    <div className="mt-0.5 text-muted-foreground">
                      {r.model_kind} · {r.period_start} → {r.period_end}
                    </div>
                    <div className="telemetry mt-1 text-[10px] text-muted-foreground/80">
                      {new Date(r.created_at).toLocaleString()}
                    </div>
                  </div>
                </label>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void onOpen(r)}
                  className="flex h-8 shrink-0 items-center gap-1.5 rounded-sm border border-border px-3 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-60"
                >
                  <FolderOpen className="h-3 w-3" />
                  Open
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function PanelTile({
  title,
  uri,
  empty,
}: {
  title: string
  uri?: string
  empty: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="eyebrow !text-foreground/80">{title}</p>
      <div className="relative aspect-[4/3] overflow-hidden rounded-sm border border-border bg-secondary/30">
        {uri ? (
          <img src={uri} alt={title} className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full items-center justify-center px-3 text-center text-[10px] text-muted-foreground">
            {empty}
          </div>
        )}
      </div>
    </div>
  )
}
