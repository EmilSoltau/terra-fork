import type {
  CompositionOverlay,
  CompositeIndex,
  CompositeKind,
  ProjectOverlay,
} from "@/lib/types"

type OverlayMeta = {
  description?: string
  kind?: CompositeKind
  bands?: [string, string, string]
  index?: CompositeIndex
  presetId?: string
  sceneDate?: string
  opacity?: number
  extent?: CompositionOverlay["extent"]
  label?: string
}

export function parseOverlayMeta(raw?: string): OverlayMeta {
  if (!raw?.trim()) return {}
  try {
    return JSON.parse(raw) as OverlayMeta
  } catch {
    return {}
  }
}

/** Map a persisted project overlay into the session CompositionOverlay shape. */
export function projectOverlayToComposition(
  o: ProjectOverlay
): CompositionOverlay | null {
  if (!o.overlay_uri) return null
  const meta = parseOverlayMeta(o.meta_json)
  const extent = meta.extent ?? {
    lon_min: 0,
    lat_min: 0,
    lon_max: 0,
    lat_max: 0,
  }
  return {
    id: o.id,
    overlay_uri: o.overlay_uri,
    extent,
    opacity: meta.opacity ?? 0.85,
    label: meta.label || o.title,
    title: o.title,
    description: meta.description,
    kind: meta.kind,
    bands: meta.bands,
    index: meta.index,
    presetId: meta.presetId,
    sceneDate: meta.sceneDate,
    raster_tif: o.raster_tif,
  }
}
