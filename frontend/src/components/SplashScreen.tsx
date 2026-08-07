import { useEffect, useState } from "react"
import { EventsOn, EventsOff } from "../../wailsjs/runtime/runtime"
import { GetBootLogs } from "../../wailsjs/go/main/App"
import {
  SPLASH_IMAGES,
  claimSplashSlideForLaunch,
} from "@/lib/splashBackground"

const SLIDE_MS = 7000

type SplashScreenProps = {
  /** When true, fade/scale out before the main window opens. */
  exiting?: boolean
}

/**
 * Compact boot UI for the small splash window (before the main shell).
 * Full-bleed aerial stills with sliding zoom; brand centered, status as one line.
 * Starting still rotates on each program launch.
 */
export function SplashScreen({ exiting = false }: SplashScreenProps) {
  const [logs, setLogs] = useState<string[]>(["booting…"])
  const [slide, setSlide] = useState(() =>
    claimSplashSlideForLaunch(SPLASH_IMAGES.length)
  )

  useEffect(() => {
    let cancelled = false

    GetBootLogs()
      .then((lines) => {
        if (cancelled) return
        const cleaned = (lines ?? []).filter(Boolean)
        if (cleaned.length) setLogs(cleaned)
      })
      .catch(() => {})

    const onLog = (msg: string) => {
      if (!msg) return
      setLogs((prev) => {
        if (prev[prev.length - 1] === msg) return prev
        return [...prev, msg]
      })
    }

    EventsOn("boot:log", onLog)
    return () => {
      cancelled = true
      EventsOff("boot:log")
    }
  }, [])

  useEffect(() => {
    if (exiting || SPLASH_IMAGES.length < 2) return
    const id = window.setInterval(() => {
      setSlide((i) => (i + 1) % SPLASH_IMAGES.length)
    }, SLIDE_MS)
    return () => window.clearInterval(id)
  }, [exiting])

  const statusLine = logs[logs.length - 1] ?? "booting…"

  return (
    <div
      className={`app-draggable splash-screen relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden px-5 text-foreground ${
        exiting ? "splash-screen--exit" : ""
      }`}
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {SPLASH_IMAGES.map((src, i) => (
          <div
            key={src}
            className={`splash-kenburns splash-kenburns--${(i % 3) + 1} ${
              i === slide ? "is-active" : ""
            }`}
            style={{ backgroundImage: `url(${src})` }}
          />
        ))}
        <div className="splash-kenburns-scrim absolute inset-0" />
      </div>

      <div className="relative z-10 flex flex-col items-center gap-3.5">
        <img
          src="/terra-logo.png"
          alt=""
          className="h-14 w-14 object-contain drop-shadow-[0_2px_12px_rgb(0_0_0_/_0.55)]"
        />
        <div className="flex flex-col items-center gap-1.5">
          <p className="font-display text-lg font-semibold tracking-[0.18em] drop-shadow-[0_1px_8px_rgb(0_0_0_/_0.65)]">
            TERRA
          </p>
          <p className="eyebrow drop-shadow-[0_1px_6px_rgb(0_0_0_/_0.55)]">
            land cover · sentinel-2
          </p>
          <div className="mt-1 h-0.5 w-7 rounded-[1px] bg-accent/85" aria-hidden />
        </div>
        <span
          className="mt-1 h-1.5 w-1.5 animate-pulse rounded-[1px] bg-accent"
          aria-hidden
        />
      </div>

      <p
        className="app-no-drag absolute bottom-4 left-4 right-4 z-10 truncate text-center font-telemetry text-[10px] tracking-wide text-foreground/85 drop-shadow-[0_1px_6px_rgb(0_0_0_/_0.75)]"
        title={statusLine}
      >
        {statusLine}
      </p>
    </div>
  )
}
