import { forwardRef } from "react"
import { motion } from "motion/react"
import { ChevronLeft, Crosshair, Trash2, Download, ImageDown } from "lucide-react"
import type { ExtractLayer } from "../lib/types"

export interface LayersPanelProps {
  panelOffsetClass?: string
  layers: ExtractLayer[]
  onToggle: (id: string) => void
  onOpacity: (id: string, v: number) => void
  onRemove: (id: string) => void
  onZoom: (layer: ExtractLayer) => void
  onClearAll: () => void
  onExportPng: (layer: ExtractLayer) => void
  onExportTif: (layer: ExtractLayer) => void
  onCollapse: () => void
}

export const LayersPanel = forwardRef<HTMLDivElement, LayersPanelProps>(
  function LayersPanel(props, ref) {
    const { layers } = props
    return (
      <motion.div
        ref={ref}
        className={`panel app-no-drag panel-scroll absolute ${props.panelOffsetClass ?? "left-3"} top-3 bottom-3 z-[1000] flex w-[19rem] flex-col gap-3 overflow-y-auto rounded-md p-4`}
        initial={{ opacity: 0, x: -28 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -28 }}
        transition={{ type: "spring", stiffness: 360, damping: 34 }}
      >
        <div className="flex items-center justify-between">
          <h1 className="text-sm font-semibold">Layers</h1>
          <button type="button" onClick={props.onCollapse} className="text-muted-foreground hover:text-foreground" title="Hide panel">
            <ChevronLeft className="size-4" />
          </button>
        </div>

        {layers.length === 0 ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            No layers yet — run an <span className="text-foreground">Extract</span> to add index layers here.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{layers.length} layer{layers.length === 1 ? "" : "s"}</span>
              <button type="button" onClick={props.onClearAll} className="flex items-center gap-1 text-destructive hover:underline">
                <Trash2 className="size-3" /> Clear all
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {layers.map((layer) => (
                <div key={layer.id} className="rounded-md border border-border bg-secondary/30 p-2">
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      onClick={() => props.onZoom(layer)}
                      title="Zoom to layer"
                      className="relative size-12 shrink-0 overflow-hidden rounded-sm border border-border"
                    >
                      {layer.overlay_uri && (
                        <img src={layer.overlay_uri} alt={layer.label} className="size-full object-cover" style={{ imageRendering: "pixelated" }} />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <label className="flex min-w-0 items-center gap-1.5 text-[12px] font-medium">
                          <input type="checkbox" className="accent-primary" checked={layer.visible} onChange={() => props.onToggle(layer.id)} />
                          <span className="truncate">{layer.label}</span>
                        </label>
                        <div className="flex shrink-0 items-center gap-1 text-muted-foreground">
                          <button type="button" title="Zoom to" onClick={() => props.onZoom(layer)} className="hover:text-foreground"><Crosshair className="size-3.5" /></button>
                          <button type="button" title="Export PNG" onClick={() => props.onExportPng(layer)} className="hover:text-foreground"><ImageDown className="size-3.5" /></button>
                          <button type="button" title="Export GeoTIFF" onClick={() => props.onExportTif(layer)} className="hover:text-foreground disabled:opacity-40" disabled={!layer.tif}><Download className="size-3.5" /></button>
                          <button type="button" title="Remove" onClick={() => props.onRemove(layer.id)} className="hover:text-destructive"><Trash2 className="size-3.5" /></button>
                        </div>
                      </div>
                      <label className="mt-1 flex flex-col gap-0.5 text-[10px] text-muted-foreground">
                        Opacity {Math.round(layer.opacity * 100)}%
                        <input
                          type="range" min={0.15} max={1} step={0.05} value={layer.opacity}
                          onChange={(e) => props.onOpacity(layer.id, Number(e.target.value))}
                          className="w-full accent-primary"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </motion.div>
    )
  }
)
