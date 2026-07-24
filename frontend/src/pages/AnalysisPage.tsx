import { Download, FolderOpen, History, Map as MapIcon, Play } from "lucide-react"
import { toast } from "sonner"
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
import { ExportClassification } from "../../wailsjs/go/main/App"
import { LulcSection } from "@/components/LulcSection"

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
}

export function AnalysisPage({
  result,
  modelKind,
  areaLabel,
  areaId,
  loadingRun,
  onOpenRun,
}: AnalysisPageProps) {
  const { goMap, runs, refreshRuns } = useAuth()

  if (!result) {
    return (
      <div className="app-no-drag flex h-full min-h-0 flex-col overflow-y-auto bg-background">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="telemetry text-[10px] text-primary">ANALYSIS</p>
            <h1 className="font-display text-xl font-semibold tracking-wide">No classification open</h1>
            <p className="max-w-md text-xs text-muted-foreground">
              Run Classify on the map, or reopen a saved analysis below. Results persist
              locally after you close the app.
            </p>
            <button
              type="button"
              onClick={goMap}
              className="flex h-9 items-center gap-1.5 rounded-sm bg-primary px-4 text-xs font-semibold text-primary-foreground"
            >
              <MapIcon className="h-3.5 w-3.5" />
              Go to map
            </button>
          </div>
          <SavedRunsPanel
            runs={runs}
            loading={!!loadingRun}
            onOpen={onOpenRun}
            onRefresh={() => void refreshRuns()}
          />
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
      if (dest) toast.success(`Exported to ${dest}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
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
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="telemetry text-[10px] text-primary">ANALYSIS</p>
            <h1 className="mt-1 font-display text-xl font-semibold tracking-wide">
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
              onClick={goMap}
              className="flex h-8 items-center gap-1.5 rounded-sm border border-border px-3 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <Play className="h-3 w-3" />
              Back to map
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
                <span className="w-44 shrink-0 truncate">{s.name}</span>
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
            <ResponsiveContainer width="100%" height={200}>
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

        {pheno && hasClassification && (
          <section className="rounded-md border border-border bg-card/40 p-5">
            <p className="eyebrow mb-3">Phenology metrics · AOI NDVI</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
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

        <SavedRunsPanel
          runs={runs}
          loading={!!loadingRun}
          onOpen={onOpenRun}
          onRefresh={() => void refreshRuns()}
        />
      </div>
    </div>
  )
}

function SavedRunsPanel({
  runs,
  loading,
  onOpen,
  onRefresh,
}: {
  runs: InferenceRun[]
  loading: boolean
  onOpen: (run: InferenceRun) => Promise<void>
  onRefresh: () => void
}) {
  return (
    <section className="rounded-md border border-border bg-card/40 p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <History className="h-3.5 w-3.5 text-primary" />
          <p className="eyebrow !text-foreground">Saved analyses</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="text-[10px] text-muted-foreground hover:text-foreground"
        >
          Refresh
        </button>
      </div>
      {runs.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No saved analyses yet. Classify an AOI on the map — results are stored locally.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {runs.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-sm border border-border/60 bg-secondary/30 px-3 py-2.5 text-xs"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-foreground">
                    {r.label || r.model_kind}
                  </span>
                  <span className="telemetry shrink-0 text-muted-foreground">{r.n_dates} scenes</span>
                </div>
                <div className="mt-0.5 text-muted-foreground">
                  {r.model_kind} · {r.period_start} → {r.period_end}
                </div>
                <div className="telemetry mt-1 text-[10px] text-muted-foreground/80">
                  {new Date(r.created_at).toLocaleString()}
                </div>
              </div>
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
          ))}
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
      <div className="relative aspect-square overflow-hidden rounded-sm border border-border bg-secondary/30">
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
