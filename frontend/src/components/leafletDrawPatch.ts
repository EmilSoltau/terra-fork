import L from "leaflet"
import "leaflet-draw"

// Compatibility patch for leaflet-draw 1.0.4 running on leaflet 1.9.x.
//
// leaflet-draw 1.0.4 was built against leaflet 1.7. Its L.Draw.Polyline._endPoint
// contains a touch-device shortcut:
//
//     else if (lastPtDistance < 10 && L.Browser.touch) { this._finishShape(); }
//
// In leaflet 1.9.x, L.Browser.touch is defined as
//     !window.L_NO_TOUCH && (touchNative || pointer)
// with pointer = !!window.PointerEvent. window.PointerEvent exists in modern
// WebKit/WKWebView (and Chromium) on non-touch desktop hardware, so
// L.Browser.touch evaluates true on desktop. The shortcut, intended only for
// touchscreens, then fires on ordinary mouse clicks: any click within 10
// container-pixels of the polygon's first vertex calls _finishShape(), and once
// 3 markers exist the polygon closes (L.Draw.Polygon._shapeIsValid requires
// markers.length >= 3). Result: polygons auto-finish at the 3rd vertex.
//
// This patch disables only that proximity-based touch shortcut by returning
// Infinity from _calculateFinishDistance, so the `< 10` branch is never taken.
// All explicit finish paths remain intact:
//   - clicking the first marker (polygon) or last marker (polyline) -> _finishShape
//     (wired by _updateFinishHandler, independent of this distance check)
//   - double-clicking the last marker -> _finishShape
//   - the toolbar Finish action -> _finishShape
//   - the maxPoints cap branch in _endPoint (uses options.maxPoints, not distance)
//
// Reference: Leaflet/Leaflet.draw issue family on "polygon closes after 3 points
// with Leaflet 1.8+". leaflet-draw 1.0.4 is the final release and unmaintained,
// so the fix is applied on the consumer side at runtime.

type DrawPolylineCtor = {
  prototype: {
    _calculateFinishDistance?: (potentialLatLng: L.LatLng) => number
  }
}

const LDraw = (L as unknown as { Draw?: { Polyline?: DrawPolylineCtor } }).Draw

if (LDraw?.Polyline?.prototype) {
  LDraw.Polyline.prototype._calculateFinishDistance = function (): number {
    return Infinity
  }
}

export {}
