import type { LeftDockTabsMode, Preferences } from "@/lib/types"

export type { LeftDockTabsMode }

export interface PreferenceExtras {
  left_dock_tabs?: LeftDockTabsMode
  active_project_id?: string
  /** Last custom AOI display name (survives restart with active project / prefs). */
  aoi_label?: string
  /** Last product version for which What’s New was shown (or silently seeded). */
  last_seen_version?: string
}

export function parsePreferenceExtras(
  raw: string | undefined | null
): PreferenceExtras {
  if (!raw?.trim()) return {}
  try {
    const parsed = JSON.parse(raw) as PreferenceExtras
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

export function leftDockTabsModeFromPrefs(
  prefs: Preferences | null | undefined
): LeftDockTabsMode {
  const mode = parsePreferenceExtras(prefs?.extras_json).left_dock_tabs
  return mode === "always" ? "always" : "retracted_only"
}

export function mergePreferenceExtras(
  raw: string | undefined | null,
  patch: PreferenceExtras
): string {
  const base = parsePreferenceExtras(raw)
  return JSON.stringify({ ...base, ...patch })
}
