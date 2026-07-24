import { AnimatePresence } from "motion/react"
import type {
  Area,
  GeoJSONGeometry,
  ModelKind,
  PredictResult,
} from "@/lib/types"
import { MapView } from "@/components/MapView"
import { SearchBar } from "@/components/SearchBar"
import { ControlPanel } from "@/components/ControlPanel"
import { ResultsPanel } from "@/components/ResultsPanel"

export interface MapScreenProps {
  areas: Area[]
  activeExample: string
  customPolygon: GeoJSONGeometry | null
  flyTo: { lat: number; lon: number; key: number } | null
  result: PredictResult | null
  overlayOpacity: number
  showConfidence: boolean
  hasArea: boolean
  start: string
  end: string
  maxCloud: number
  monthlyBest: boolean
  mode: "single" | "temporal"
  modelKind: ModelKind
  prithviMode: "pixel" | "patch"
  running: boolean
  progress: number
  progressMsg: string
  onViewChange: (v: { lat: number; lon: number; zoom: number }) => void
  onPolygonDrawn: (geom: GeoJSONGeometry | null) => void
  onSelectExample: (id: string) => void
  onLocationSelect: (lat: number, lon: number) => void
  onClearArea: () => void
  onImportPolygon: () => void
  onStartChange: (v: string) => void
  onEndChange: (v: string) => void
  onMaxCloudChange: (v: number) => void
  onMonthlyBestChange: (v: boolean) => void
  onModeChange: (m: "single" | "temporal") => void
  onModelKindChange: (m: ModelKind) => void
  onPrithviModeChange: (m: "pixel" | "patch") => void
  onOpacityChange: (v: number) => void
  onShowConfidenceChange: (v: boolean) => void
  onRun: () => void
  onCloseResult: () => void
}

export function MapScreen(props: MapScreenProps) {
  return (
    <div className="relative h-full min-h-0 w-full">
      <MapView
        areas={props.areas}
        activeExample={props.activeExample}
        customPolygon={props.customPolygon}
        onPolygonDrawn={props.onPolygonDrawn}
        onSelectExample={props.onSelectExample}
        flyTo={props.flyTo}
        result={props.result}
        overlayOpacity={props.overlayOpacity}
        showConfidence={props.showConfidence}
        onViewChange={props.onViewChange}
      />

      <SearchBar onSelectLocation={props.onLocationSelect} />

      <ControlPanel
        areas={props.areas}
        activeExample={props.activeExample}
        onSelectExample={props.onSelectExample}
        customPolygon={props.customPolygon}
        hasArea={props.hasArea}
        onClearArea={props.onClearArea}
        onImportPolygon={props.onImportPolygon}
        start={props.start}
        end={props.end}
        onStartChange={props.onStartChange}
        onEndChange={props.onEndChange}
        maxCloud={props.maxCloud}
        onMaxCloudChange={props.onMaxCloudChange}
        monthlyBest={props.monthlyBest}
        onMonthlyBestChange={props.onMonthlyBestChange}
        mode={props.mode}
        onModeChange={props.onModeChange}
        modelKind={props.modelKind}
        onModelKindChange={props.onModelKindChange}
        prithviMode={props.prithviMode}
        onPrithviModeChange={props.onPrithviModeChange}
        overlayOpacity={props.overlayOpacity}
        onOpacityChange={props.onOpacityChange}
        running={props.running}
        progress={props.progress}
        progressMsg={props.progressMsg}
        onRun={props.onRun}
      />

      <AnimatePresence>
        {props.result && (
          <ResultsPanel
            result={props.result}
            showConfidence={props.showConfidence}
            onShowConfidenceChange={props.onShowConfidenceChange}
            onClose={props.onCloseResult}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
