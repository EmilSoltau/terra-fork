import { useEffect, useState } from "react"
import { Save } from "lucide-react"
import { useAuth } from "@/lib/auth"
import type { Preferences } from "@/lib/types"

export function SettingsPage() {
  const { user, prefs, savePrefs, goAuth } = useAuth()
  const [model, setModel] = useState("spectral")
  const [opacity, setOpacity] = useState(0.75)
  const [theme, setTheme] = useState("dark")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) {
      goAuth()
      return
    }
    if (prefs) {
      setModel(prefs.default_model || "spectral")
      setOpacity(prefs.overlay_opacity ?? 0.75)
      setTheme(prefs.theme || "dark")
    }
  }, [user, prefs, goAuth])

  if (!user) return null

  const save = async () => {
    setBusy(true)
    try {
      const next: Preferences = {
        user_id: user.id,
        default_model: model,
        overlay_opacity: opacity,
        theme,
        extras_json: prefs?.extras_json || "{}",
      }
      await savePrefs(next)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-no-drag flex h-full min-h-0 flex-col overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-8">
        <div>
          <p className="telemetry text-[10px] text-primary">SETTINGS</p>
          <h1 className="mt-1 text-xl font-semibold tracking-wide">Preferences</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Defaults applied when you open the map and after login.
          </p>
        </div>

        <section className="rounded-md border border-border bg-card/40 p-5">
          <p className="eyebrow mb-4">Classification defaults</p>
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span className="eyebrow">Default model</span>
              <select
                className="field-input"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              >
                <option value="spectral">Random Forest (spectral)</option>
                <option value="prithvi">Prithvi-EO 2.0</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="eyebrow">Overlay opacity · {opacity.toFixed(2)}</span>
              <input
                type="range"
                min={0.2}
                max={1}
                step={0.05}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                className="w-full"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="eyebrow">Theme</span>
              <select
                className="field-input"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
              >
                <option value="dark">Dark</option>
                <option value="system">System</option>
              </select>
            </label>

            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="flex h-9 w-fit items-center justify-center gap-1.5 rounded-sm bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            >
              <Save className="h-3 w-3" />
              Save settings
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
