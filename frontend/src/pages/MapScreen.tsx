import { useState } from "react"
import { AnimatePresence } from "motion/react"
import type {
  Area,
  CompositionOverlay,
  CompositeIndex,
  CompositeKind,
  DataCubeResult,
  DataCubeScene,
  GeoJSONGeometry,
  LeftDockTabsMode,
  ModelKind,
  PredictResult,
} from "@/lib/types"
import { MapView } from "@/components/MapView"
import { SearchBar } from "@/components/SearchBar"
import { ControlPanel } from "@/components/ControlPanel"
import { CompositionPanel } from "@/components/CompositionPanel"
import { LeftDockRail, type LeftDockPanel } from "@/components/LeftDockRail"
import { ResultsPanel } from "@/components/ResultsPanel"
import { DataCubeModal } from "@/components/DataCubeModal"
import { ConfidenceLegend } from "@/components/ConfidenceLegend"

export interface MapScreenProps {
  areas: Area[]
  activeExample: string
  customPolygon: GeoJSONGeometry | null
  flyTo: { lat: number; lon: number; key: number } | null
  result: PredictResult | null
  overlayOpacity: number
  showConfidence: boolean
  confidenceOnTop: boolean
  smoothOverlay: boolean
  showPredictionOverlay: boolean
  showCompositionOverlay: boolean
  composition: CompositionOverlay | null
  areaLabel?: string
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
  composeRunning: boolean
  composeProgress: number
  composeProgressMsg: string
  composeScenes: DataCubeScene[]
  composeScenesLoading: boolean
  composeScenesError: string | null
  selectedSceneId: string
  composeKind: CompositeKind
  composeBands: [string, string, string]
  composeIndex: CompositeIndex
  composeStretchLow: number
  composeStretchHigh: number
  composeOpacity: number
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
  onConfidenceOnTopChange: (v: boolean) => void
  onSmoothOverlayChange: (v: boolean) => void
  onShowPredictionOverlayChange: (v: boolean) => void
  onShowCompositionOverlayChange: (v: boolean) => void
  onSelectScene: (id: string) => void
  onComposeKindChange: (k: CompositeKind) => void
  onComposeBandsChange: (b: [string, string, string]) => void
  onComposeIndexChange: (i: CompositeIndex) => void
  onComposeStretchChange: (low: number, high: number) => void
  onComposeOpacityChange: (v: number) => void
  onListComposeScenes: () => void
  onApplyComposition: () => void
  onClearComposition: () => void
  onRun: () => void
  onAnalyzeLULC: () => void
  lulcRunning?: boolean
  onCloseResult: () => void
  onNewClassification: () => void
  onViewDataCube: () => void
  dataCubeLoading?: boolean
  dataCubeOpen?: boolean
  dataCubeError?: string | null
  dataCubeResult?: DataCubeResult | null
  onCloseDataCube: () => void
  leftDockTabs?: LeftDockTabsMode
}

export function MapScreen(props: MapScreenProps) {
  const [leftPanel, setLeftPanel] = useState<LeftDockPanel | null>("classify")
  const tabsMode = props.leftDockTabs ?? "retracted_only"
  const showDockTabs = tabsMode === "always" || leftPanel === null
  const panelOffsetClass =
    tabsMode === "always" && showDockTabs ? "left-14" : "left-3"

  const selectDock = (id: LeftDockPanel) => {
    setLeftPanel((cur) => (cur === id ? null : id))
  }

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
        confidenceOnTop={props.confidenceOnTop}
        smoothOverlay={props.smoothOverlay}
        showPredictionOverlay={props.showPredictionOverlay}
        showCompositionOverlay={props.showCompositionOverlay}
        composition={props.composition}
        areaLabel={props.areaLabel}
        onViewChange={props.onViewChange}
      />

      <SearchBar onSelectLocation={props.onLocationSelect} />

      <ConfidenceLegend
        visible={
          !!props.showConfidence &&
          !!props.result?.confidence_uri &&
          (props.result.n_dates ?? 0) > 0
        }
      />

      <AnimatePresence initial={false}>
        {showDockTabs && (
          <LeftDockRail
            key="dock-rail"
            active={leftPanel}
            onSelect={selectDock}
          />
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait" initial={false}>
        {leftPanel === "classify" ? (
          <ControlPanel
            key="classify"
            panelOffsetClass={panelOffsetClass}
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
            smoothOverlay={props.smoothOverlay}
            onSmoothOverlayChange={props.onSmoothOverlayChange}
            running={props.running}
            progress={props.progress}
            progressMsg={props.progressMsg}
            onRun={props.onRun}
            onAnalyzeLULC={props.onAnalyzeLULC}
            onViewDataCube={props.onViewDataCube}
            lulcRunning={props.lulcRunning}
            dataCubeLoading={props.dataCubeLoading}
            onCollapse={() => setLeftPanel(null)}
          />
        ) : leftPanel === "compose" ? (
          <CompositionPanel
            key="compose"
            panelOffsetClass={panelOffsetClass}
            hasArea={props.hasArea}
            start={props.start}
            end={props.end}
            onStartChange={props.onStartChange}
            onEndChange={props.onEndChange}
            maxCloud={props.maxCloud}
            onMaxCloudChange={props.onMaxCloudChange}
            monthlyBest={props.monthlyBest}
            onMonthlyBestChange={props.onMonthlyBestChange}
            scenes={props.composeScenes}
            scenesLoading={props.composeScenesLoading}
            scenesError={props.composeScenesError}
            selectedSceneId={props.selectedSceneId}
            onSelectScene={props.onSelectScene}
            onListScenes={props.onListComposeScenes}
            kind={props.composeKind}
            onKindChange={props.onComposeKindChange}
            bands={props.composeBands}
            onBandsChange={props.onComposeBandsChange}
            index={props.composeIndex}
            onIndexChange={props.onComposeIndexChange}
            stretchLow={props.composeStretchLow}
            stretchHigh={props.composeStretchHigh}
            onStretchChange={props.onComposeStretchChange}
            opacity={props.composeOpacity}
            onOpacityChange={props.onComposeOpacityChange}
            running={props.composeRunning}
            progress={props.composeProgress}
            progressMsg={props.composeProgressMsg}
            hasOverlay={!!props.composition}
            showCompositionOverlay={props.showCompositionOverlay}
            onShowCompositionOverlayChange={props.onShowCompositionOverlayChange}
            onApply={props.onApplyComposition}
            onClear={props.onClearComposition}
            onCollapse={() => setLeftPanel(null)}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {props.result && (
          <ResultsPanel
            result={props.result}
            showPredictionOverlay={props.showPredictionOverlay}
            onShowPredictionOverlayChange={props.onShowPredictionOverlayChange}
            showConfidence={props.showConfidence}
            onShowConfidenceChange={props.onShowConfidenceChange}
            confidenceOnTop={props.confidenceOnTop}
            onConfidenceOnTopChange={props.onConfidenceOnTopChange}
            smoothOverlay={props.smoothOverlay}
            onSmoothOverlayChange={props.onSmoothOverlayChange}
            onClose={props.onCloseResult}
            onNewClassification={props.onNewClassification}
          />
        )}
      </AnimatePresence>

      <DataCubeModal
        open={!!props.dataCubeOpen}
        loading={!!props.dataCubeLoading}
        error={props.dataCubeError ?? null}
        result={props.dataCubeResult ?? null}
        onClose={props.onCloseDataCube}
      />
    </div>
  )
}
