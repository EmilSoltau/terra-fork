import { useState } from "react"
import { motion } from "motion/react"
import { X, ChevronDown, ChevronUp } from "lucide-react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import type { PredictResult } from "@/lib/types"
import { cn } from "@/lib/utils"

interface ResultsPanelProps {
  result: PredictResult
  onClose: () => void
}

export function ResultsPanel({ result, onClose }: ResultsPanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  const temporal = result.temporal ?? []
  const hasRetention = temporal.some((t) => t.soja_retention_pct != null)
  const chartData = temporal.map((t) => ({
    date: t.date,
    retencao: t.soja_retention_pct ?? null,
  }))

  return (
    <motion.div
      className="panel app-no-drag absolute bottom-3 left-[20.5rem] right-16 z-[1000] mx-auto max-w-[40rem] rounded-md"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-baseline gap-2">
          <span className="eyebrow !text-foreground">Result</span>
          <span className="telemetry text-[11px] text-muted-foreground">
            {result.n_dates} scenes · {result.date_range[0]} → {result.date_range[1]}
          </span>
        </div>
        <div className="flex items-center gap-1">
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
            title="Close"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <hr className="hairline" />
          <div className={cn("grid gap-4 p-3", hasRetention ? "grid-cols-2" : "grid-cols-1")}>
            {/* Class distribution as horizontal proportion bars */}
            <div className="flex flex-col gap-2">
              <span className="eyebrow">class distribution</span>
              <ul className="flex flex-col gap-1.5">
                {result.class_stats.map((s) => (
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
                    <span className="telemetry w-16 shrink-0 text-right text-muted-foreground">
                      {s.area_ha.toFixed(1)} ha
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {hasRetention && (
              <div className="flex flex-col gap-2">
                <span className="eyebrow">soybean retention · stacking</span>
                <ResponsiveContainer width="100%" height={150}>
                  <LineChart data={chartData} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="var(--hairline)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 9, fill: "var(--muted-foreground)", fontFamily: "var(--font-telemetry)" }}
                      tickFormatter={(d: string) => d.slice(2, 7)}
                      interval="preserveStartEnd"
                      minTickGap={20}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 9, fill: "var(--muted-foreground)", fontFamily: "var(--font-telemetry)" }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 4,
                        fontSize: 11,
                        fontFamily: "var(--font-telemetry)",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="retencao"
                      name="retention %"
                      stroke="var(--primary)"
                      strokeWidth={1.8}
                      dot={{ r: 1.5 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      )}
    </motion.div>
  )
}
