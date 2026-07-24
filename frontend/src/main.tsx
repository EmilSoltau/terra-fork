import { createRoot } from "react-dom/client"
import { ThemeProvider } from "next-themes"
import { Toaster } from "sonner"
import "./components/leafletDrawPatch"
import "./index.css"
import App from "./App"

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
