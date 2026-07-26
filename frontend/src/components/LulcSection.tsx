import type { LULCAnalysis } from "@/lib/types"

const CALENDAR_NOTES: Record<string, string> = {
  A: "Wheat → Soybean → Fallow → Oat → Soybean",
  B: "Wheat → Corn+Soy → Cover crop → Wheat → Corn+Soy",
  C: "Corn → Soybean → Second-crop corn → Corn → Soybean",
}

interface LulcSectionProps {
  lulc: LULCAnalysis
  areaId?: string
  areaLabel?: string
}

export function LulcSection({ lulc, areaId, areaLabel }: LulcSectionProps) {
  const m = lulc.metrics
  const calendar = areaId ? CALENDAR_NOTES[areaId] : undefined
  const hasCompare = (lulc.pred_vs_ref?.length ?? 0) > 0

  return (
    <section className="rounded-md border border-border bg-card/40 p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="eyebrow">Land cover / land use</p>
          <h2 className="mt-1 font-display text-base font-semibold tracking-wide">
            MapBiomas {lulc.year || 2023}
            {areaLabel ? ` — ${areaLabel}` : ""}
          </h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {lulc.source || "MapBiomas Collection 10"} · descriptive composition
            (no classifier)
          </p>
        </div>
        {calendar && (
          <p className="max-w-xs rounded-sm border border-border/60 bg-secondary/20 px-2 py-1.5 text-[10px] text-muted-foreground">
            Documented use: {calendar}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,14rem)_1fr]">
        {lulc.map_uri ? (
          <div className="overflow-hidden rounded-sm border border-border/60 bg-ink/40">
            <img
              src={lulc.map_uri}
              alt="MapBiomas land cover"
              className="h-full w-full object-contain"
            />
          </div>
        ) : (
          <div className="flex min-h-[8rem] items-center justify-center rounded-sm border border-dashed border-border/60 text-[11px] text-muted-foreground">
            Map unavailable
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <Metric label="Area" value={`${m.area_ha.toFixed(1)} ha`} />
          <Metric label="Classes" value={String(m.n_classes)} />
          <Metric label="Shannon H" value={m.shannon_h.toFixed(3)} />
          <Metric label="Pielou J" value={m.pielou_j.toFixed(3)} />
          <Metric label="Dominant" value={`${m.dominant_pct.toFixed(1)}%`} sub={m.dominant_class} />
          <Metric label="Soybean 39" value={`${m.soja_pct.toFixed(1)}%`} />
          <Metric label="Other crops 41" value={`${m.outras_lav_pct.toFixed(1)}%`} />
          <Metric label="Agricultural*" value={`${m.agricola_pct.toFixed(1)}%`} />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
        <div>
          <p className="eyebrow mb-2">Cover composition</p>
          <StatBars
            rows={lulc.composition.map((r) => ({
              key: String(r.class_id),
              label: `${r.class_id} ${r.name}`,
              color: r.color,
              pct: r.pct,
              right: `${r.area_ha.toFixed(1)} ha`,
            }))}
          />
        </div>
        <div>
          <p className="eyebrow mb-2">Land-use groups</p>
          <StatBars
            rows={lulc.groups.map((r) => ({
              key: r.group,
              label: r.group,
              color: r.color,
              pct: r.pct,
              right: `${r.area_ha.toFixed(1)} ha`,
            }))}
          />
        </div>
      </div>

      {hasCompare && (
        <div className="mt-5">
          <p className="eyebrow mb-2">MapBiomas vs predicted (shared pixels)</p>
          <div className="flex flex-col gap-1.5">
            {lulc.pred_vs_ref.map((r) => (
              <div key={r.class_id} className="grid grid-cols-[7rem_1fr_3rem_3rem] items-center gap-2 text-[11px]">
                <span className="flex items-center gap-1.5 truncate text-muted-foreground">
                  <span
                    className="size-2 shrink-0 rounded-[2px]"
                    style={{ backgroundColor: r.color }}
                  />
                  {r.class_id}
                </span>
                <div className="relative h-2 overflow-hidden rounded-full bg-secondary">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full opacity-40"
                    style={{ width: `${r.pct_ref}%`, backgroundColor: r.color }}
                  />
                  <span
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ width: `${r.pct_pred}%`, backgroundColor: r.color }}
                  />
                </div>
                <span className="telemetry text-right text-muted-foreground">
                  {r.pct_ref.toFixed(0)}%
                </span>
                <span className="telemetry text-right text-foreground">
                  {r.pct_pred.toFixed(0)}%
                </span>
              </div>
            ))}
            <div className="mt-1 flex justify-end gap-4 text-[10px] text-muted-foreground">
              <span>dim = MapBiomas</span>
              <span>solid = predicted</span>
            </div>
          </div>
        </div>
      )}

      <p className="mt-4 text-[10px] text-muted-foreground">
        *Agricultural = annual cropland (39+41) + mosaic (21). Annual MapBiomas
        labels compress crop rotations into a single cover class.
      </p>
    </section>
  )
}

function Metric({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="rounded-sm border border-border/60 bg-secondary/20 px-2 py-1.5">
      <div className="eyebrow">{label}</div>
      <div className="telemetry mt-0.5 text-[12px] text-foreground">{value}</div>
      {sub && (
        <div className="mt-0.5 truncate text-[9px] text-muted-foreground">{sub}</div>
      )}
    </div>
  )
}

function StatBars({
  rows,
}: {
  rows: { key: string; label: string; color: string; pct: number; right: string }[]
}) {
  if (!rows.length) {
    return <p className="text-[11px] text-muted-foreground">No classes in AOI.</p>
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <li key={r.key} className="flex items-center gap-2 text-xs">
          <span
            className="size-2.5 shrink-0 rounded-[2px]"
            style={{ backgroundColor: r.color }}
          />
          <span className="w-40 shrink-0 truncate sm:w-48">{r.label}</span>
          <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-secondary">
            <span
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${r.pct}%`, backgroundColor: r.color }}
            />
          </span>
          <span className="telemetry w-12 shrink-0 text-right">{r.pct.toFixed(1)}%</span>
          <span className="telemetry hidden w-16 shrink-0 text-right text-muted-foreground sm:inline">
            {r.right}
          </span>
        </li>
      ))}
    </ul>
  )
}
