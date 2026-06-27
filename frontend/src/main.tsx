import { createRoot } from "react-dom/client"
import { ThemeProvider } from "next-themes"
import { Toaster } from "sonner"
import "./index.css"
import App from "./App"

// Note: React.StrictMode is intentionally omitted. Its development-only
// double-mounting of effects re-initializes the imperative leaflet-draw control
// twice, leaving two active draw handlers that corrupt the vertex count and
// finish polygons prematurely. The double-invoke does not occur in production
// builds; omitting StrictMode keeps dev behavior consistent with production.
const container = document.getElementById("root")
const root = createRoot(container!)

root.render(
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
    <App />
    <Toaster richColors position="top-right" theme="dark" />
  </ThemeProvider>
)
