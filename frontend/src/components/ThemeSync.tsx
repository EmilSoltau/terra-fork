import { useEffect } from "react"
import { useTheme } from "next-themes"
import { useAuth } from "@/lib/auth"

/** Applies saved prefs.theme → next-themes (data-theme on <html>). */
export function ThemeSync() {
  const { setTheme } = useTheme()
  const { prefs } = useAuth()

  useEffect(() => {
    const t = prefs?.theme
    if (t === "dark" || t === "light" || t === "system") {
      setTheme(t)
    }
  }, [prefs?.theme, setTheme])

  return null
}
