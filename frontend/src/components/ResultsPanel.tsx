import { useState } from "react"
import { motion } from "motion/react"
import { X, ChevronDown, ChevronUp, ChartColumn, Plus } from "lucide-react"
import type { PredictResult } from "@/lib/types"
import { useAuth } from "@/lib/auth"

interface ResultsPanelProps {
  result: PredictResult
  showConfidence: boolean
  onShowConfidenceChange: (v: boolean) => void
  confidenceOnTop: boolean
  onConfidenceOnTopChange: (v: boolean) => void
  smoothOverlay: boolean
  onSmoothOverlayChange: (v: boolean) => void
  swipeCompare: boolean
  onSwipeCompareChange: (v: boolean) => void
  onClose: () => void
  onNewClassification: () => void
}

export function ResultsPanel({
  result,
  showConfidence,
  onShowConfidenceChange,
  confidenceOnTop,
  onConfidenceOnTopChange,
  smoothOverlay,
  onSmoothOverlayChange,
  swipeCompare,
  onSwipeCompareChange,
  onClose,
  onNewClassification,
}: ResultsPanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  const { goAnalysis } = useAuth()

  const isLulcOnly =
    !!result.lulc &&
    !(result.n_dates > 0) &&
    !(result.confidence_uri && result.confidence_uri.length > 0)

  const stats = isLulcOnly
    ? (result.lulc?.composition ?? []).map((c) => ({
        class_id: c.class_id,
        name: c.name,
        color: c.color,
        pct: c.pct,
      }))
    : result.class_stats

  const subtitle = isLulcOnly
    ? `MapBiomas ${result.lulc?.year ?? 2023} · ${result.lulc?.metrics.area_ha.toFixed(1) ?? "—"} ha`
    : `${result.n_dates} scenes · ${result.date_range?.[0] ?? "—"} → ${result.date_range?.[1] ?? "—"}`

  return (
    <motion.div
      className="panel app-no-drag absolute bottom-3 left-[20.5rem] right-16 z-[1000] mx-auto max-w-[36rem] rounded-md"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-baseline gap-2">
          <span className="eyebrow !text-foreground">
            {isLulcOnly ? "Land cover" : "Result"}
          </span>
          <span className="telemetry text-[11px] text-muted-foreground">
            {subtitle}
            {!isLulcOnly && result.mean_confidence > 0 && (
              <> · conf {(result.mean_confidence * 100).toFixed(0)}%</>
            )}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goAnalysis}
            className="flex items-center gap-1 rounded-sm px-2 py-1 text-[11px] text-primary hover:bg-primary/10"
            title="Open analysis"
          >
            <ChartColumn className="size-3.5" />
            Analysis
          </button>
          <button
            type="button"
            onClick={onNewClassification}
            className="flex items-center gap-1 rounded-sm px-2 py-1 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
            title="Start a new classification"
          >
            <Plus className="size-3.5" />
            New
          </button>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="text-muted-foreground hover:text-foreground"
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            title="Close result"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <hr className="hairline" />
          <div className="flex flex-col gap-3 p-3">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={smoothOverlay}
                  onChange={(e) => onSmoothOverlayChange(e.target.checked)}
                  className="accent-primary"
                />
                Smooth prediction overlay
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={swipeCompare}
                  onChange={(e) => onSwipeCompareChange(e.target.checked)}
                  className="accent-primary"
                />
                Swipe imagery ↔ overlay
              </label>
              {!isLulcOnly && (
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={showConfidence}
                    onChange={(e) => onShowConfidenceChange(e.target.checked)}
                    className="accent-primary"
                  />
                  Show confidence overlay
                </label>
              )}
              {!isLulcOnly && (
                <label
                  className={`flex items-center gap-1.5 text-[11px] text-muted-foreground ${
                    !showConfidence ? "opacity-45" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={confidenceOnTop}
                    disabled={!showConfidence}
                    onChange={(e) => onConfidenceOnTopChange(e.target.checked)}
                    className="accent-primary"
                  />
                  Keep prediction under confidence
                </label>
              )}
            </div>
            <ul className="flex flex-col gap-1.5">
              {stats.slice(0, 5).map((s) => (
                <li key={s.class_id} className="flex items-center gap-2 text-xs">
                  <span
                    className="size-2.5 shrink-0 rounded-[2px]"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="w-40 shrink-0 truncate">{s.name}</span>
                  <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{ width: `${s.pct}%`, backgroundColor: s.color }}
                    />
                  </span>
                  <span className="telemetry w-12 shrink-0 text-right text-foreground">
                    {s.pct.toFixed(1)}%
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-muted-foreground">
              {isLulcOnly
                ? "MapBiomas cover on the map. Open Analysis for groups, diversity and details."
                : swipeCompare
                  ? "Drag the handle to reveal satellite imagery under the prediction / confidence overlay."
                  : "Open Analysis for land cover / use, cover map, VI series and phenology."}
            </p>
          </div>
        </>
      )}
    </motion.div>
  )
}
