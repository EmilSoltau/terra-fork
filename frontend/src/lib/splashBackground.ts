/** Aerial stills for splash Ken Burns — keep in sync with index.html inline script. */
export const SPLASH_IMAGES = [
  "/terra-splash-images/pexels-aleksandar069-15509901.jpg",
  "/terra-splash-images/pexels-andrey-kwin-145997290-10436186.jpg",
  "/terra-splash-images/pexels-zelch-30596252.jpg",
] as const

export const SPLASH_NEXT_KEY = "terra.splash.next"
export const SPLASH_CURRENT_KEY = "terra.splash.current"

/**
 * Pick the splash image for this app launch and advance the counter for the next open.
 * Safe to call once per boot (HTML claims first; React reuses sessionStorage).
 */
export function claimSplashSlideForLaunch(
  count: number = SPLASH_IMAGES.length
): number {
  if (count <= 0) return 0
  try {
    const existing = sessionStorage.getItem(SPLASH_CURRENT_KEY)
    if (existing != null) {
      const parsed = Number.parseInt(existing, 10)
      if (Number.isFinite(parsed)) {
        return ((parsed % count) + count) % count
      }
    }
  } catch {
    /* sessionStorage unavailable */
  }

  let next = 0
  try {
    const raw = localStorage.getItem(SPLASH_NEXT_KEY)
    const parsed = Number.parseInt(raw ?? "0", 10)
    if (Number.isFinite(parsed)) next = parsed
  } catch {
    /* localStorage unavailable */
  }

  const index = ((next % count) + count) % count
  try {
    localStorage.setItem(SPLASH_NEXT_KEY, String((index + 1) % count))
    sessionStorage.setItem(SPLASH_CURRENT_KEY, String(index))
  } catch {
    /* ignore quota / private mode */
  }
  return index
}
