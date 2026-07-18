import L from "leaflet"
import "leaflet-draw"

// Compatibility patch for leaflet-draw 1.0.4 on Leaflet 1.9.x / Wails WKWebView.
//
// Symptoms: after the 3rd vertex, further clicks appear to "finish" the polygon.
// Runtime evidence showed the handler stayed active; clicks were dropped because
// dragCheckDistance exceeded leaflet-draw's 9*dpr threshold (e.g. 44 > 18 on
// retina) once the filled triangle was on screen.
//
// Also harden against WKWebView PointerEvent quirks:
//   - L_NO_TOUCH / Browser.touch=false (also set early in index.html)
//   - No-op _onTouch (pointer→touch synthesis)
//   - _endPoint always adds a vertex when latlng is present (map pan is off)
//   - Polygon finish only via first-marker click or toolbar Finish (no dblclick)

window.L_NO_TOUCH = true

const browser = (L as unknown as { Browser?: { touch?: boolean } }).Browser
if (browser) {
  browser.touch = false
}

type DrawHandler = {
  _markers?: L.Marker[]
  _finishIgnoreUntil?: number
  _shapeIsValid?: () => boolean
  _fireCreatedEvent?: () => void
  disable?: () => void
  enable?: () => void
  options?: { allowIntersection?: boolean; repeatMode?: boolean; maxPoints?: number }
  _poly?: {
    _defaultShape?: () => L.LatLng[]
    getLatLngs: () => L.LatLng[]
    newLatLngIntersects: (latlng: L.LatLng) => boolean
  }
  _showErrorTooltip?: () => void
  addVertex?: (latlng: L.LatLng) => void
  _enableNewMarkers?: () => void
  _mouseDownOrigin?: L.Point | null
  _finishShape?: () => void
  type?: string
}

type DrawPolylineCtor = {
  prototype: DrawHandler & {
    _calculateFinishDistance?: (potentialLatLng: L.LatLng) => number
    _onTouch?: (e: L.LeafletEvent) => void
    _endPoint?: (clientX: number, clientY: number, e: L.LeafletEvent) => void
    _finishShape?: () => void
  }
}

type DrawPolygonCtor = {
  prototype: DrawHandler & {
    _updateFinishHandler?: () => void
  }
}

const LDraw = (
  L as unknown as {
    Draw?: { Polyline?: DrawPolylineCtor; Polygon?: DrawPolygonCtor }
  }
).Draw

if (LDraw?.Polyline?.prototype) {
  const proto = LDraw.Polyline.prototype

  proto._calculateFinishDistance = function (): number {
    return Infinity
  }

  proto._onTouch = function (): void {}

  proto._endPoint = function (
    this: DrawHandler,
    _clientX: number,
    _clientY: number,
    e: L.LeafletEvent
  ): void {
    if (!this._mouseDownOrigin) return

    const latlng = (e as L.LeafletMouseEvent).latlng
    // Do not gate on drag distance: after ≥3 vertices the filled shape makes
    // mousedown/mouseup deltas routinely exceed leaflet-draw's 9*dpr limit.
    if (latlng) {
      this._finishIgnoreUntil = Date.now() + 50
      this.addVertex?.(latlng)
    }
    this._enableNewMarkers?.()
    this._mouseDownOrigin = null
  }

  const originalFinish = proto._finishShape
  proto._finishShape = function (this: DrawHandler): void {
    if (this._finishIgnoreUntil && Date.now() < this._finishIgnoreUntil) {
      return
    }
    if (typeof originalFinish === "function") {
      originalFinish.call(this)
    }
  }
}

if (LDraw?.Polygon?.prototype) {
  LDraw.Polygon.prototype._updateFinishHandler = function (this: DrawHandler): void {
    const markers = this._markers
    if (!markers) return

    // Click first vertex to close (defer so the creating click cannot fire it).
    if (markers.length === 1) {
      const marker = markers[0]
      const finish = this._finishShape
      if (finish) {
        window.setTimeout(() => {
          marker.on("click", finish, this)
        }, 100)
      }
    }
    // Intentionally omit dblclick → finish (WKWebView/trackpad false positives).
  }
}

export {}
