import { createRoot } from "react-dom/client"
import { ThemeProvider } from "next-themes"
import { Toaster } from "sonner"
import "./components/leafletDrawPatch"
import "./index.css"
import App from "./App"

function dismissSplash(opts: { minMs?: number } = {}): void {
  const minMs = opts.minMs ?? 900
  const el = document.getElementById("splash")
  if (!el) return

  const started = performance.now()

  const finish = () => {
    const wait = Math.max(0, minMs - (performance.now() - started))
    window.setTimeout(() => {
      const onDone = () => {
        el.remove()
      }
      el.addEventListener("transitionend", onDone, { once: true })
      el.classList.add("is-done")
      // Fallback if transitionend never fires (display/visibility edge cases).
      window.setTimeout(onDone, 600)
    }, wait)
  }

  // Prefer first paint of the React tree before fading.
  requestAnimationFrame(() => requestAnimationFrame(finish))
}

// Note: React.StrictMode is intentionally omitted. Its development-only
// double-mounting of effects re-initializes the imperative leaflet-draw control
// twice, leaving two active draw handlers that corrupt the vertex count and
// finish polygons prematurely.
const container = document.getElementById("root")
const root = createRoot(container!)

root.render(
  <ThemeProvider
    attribute="data-theme"
    defaultTheme="dark"
    enableSystem
    storageKey="geosense-theme"
  >
    <App />
    <Toaster richColors position="top-right" />
  </ThemeProvider>
)

dismissSplash({ minMs: 900 })
