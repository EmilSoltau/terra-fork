import { Minus, Square, X } from "lucide-react"
import {
  WindowMinimise,
  WindowToggleMaximise,
  Quit,
} from "../../wailsjs/runtime/runtime"
import type { PredictResult } from "@/lib/types"
import { useAuth } from "@/lib/auth"

interface TitleBarProps {
  view: { lat: number; lon: number; zoom: number }
  result: PredictResult | null
}

function fmtCoord(v: number, pos: string, neg: string): string {
  const dir = v >= 0 ? pos : neg
  return `${Math.abs(v).toFixed(4)}°${dir}`
}

// Frameless title bar: brand + context + map telemetry. Navigation lives in
// the left AppSidebar so the header stays free of per-page icons.
export function TitleBar({ view, result }: TitleBarProps) {
  const { screen } = useAuth()
  const onMap = screen === "map"

  return (
    <header className="app-draggable flex h-11 shrink-0 items-center justify-between border-b border-border bg-card/60 pl-20 pr-2 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <img
            src="/terra-logo.png"
            alt=""
            className="h-7 w-7 object-contain"
          />
          <span className="text-sm font-semibold tracking-[0.18em]">GEOSENSE</span>
        </div>
        <span className="hairline h-4 w-px self-center border-l" />
        <span className="eyebrow hidden sm:inline">
          {onMap
            ? "land cover · sentinel-2"
            : screen === "auth"
              ? "sign in"
              : "profile"}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {onMap && (
          <div className="telemetry hidden items-center gap-4 text-[11px] text-muted-foreground lg:flex">
            <span>
              LAT <span className="text-foreground">{fmtCoord(view.lat, "N", "S")}</span>
            </span>
            <span>
              LON <span className="text-foreground">{fmtCoord(view.lon, "E", "W")}</span>
            </span>
            <span>
              Z <span className="text-foreground">{view.zoom.toFixed(0)}</span>
            </span>
            {result && (
              <>
                <span className="hairline h-4 w-px self-center border-l" />
                <span>
                  CENAS <span className="text-primary">{result.n_dates}</span>
                </span>
              </>
            )}
          </div>
        )}

        <div className="app-no-drag flex items-center gap-1">
          <WindowButton onClick={WindowMinimise} title="Minimize">
            <Minus className="h-3.5 w-3.5" />
          </WindowButton>
          <WindowButton onClick={WindowToggleMaximise} title="Maximize">
            <Square className="h-3 w-3" />
          </WindowButton>
          <WindowButton onClick={Quit} danger title="Close">
            <X className="h-3.5 w-3.5" />
          </WindowButton>
        </div>
      </div>
    </header>
  )
}

function WindowButton({
  children,
  onClick,
  danger,
  title,
}: {
  children: React.ReactNode
  onClick: () => void
  danger?: boolean
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground ${
        danger ? "hover:bg-destructive hover:text-white" : "hover:bg-secondary"
      }`}
    >
      {children}
    </button>
  )
}
