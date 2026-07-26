import { useEffect, useState } from "react"
import { EventsOn, EventsOff } from "../../wailsjs/runtime/runtime"
import { GetBootLogs } from "../../wailsjs/go/main/App"

const MAX_VISIBLE = 5

type SplashScreenProps = {
  /** When true, fade/scale out before the main window opens. */
  exiting?: boolean
}

/**
 * Compact boot UI for the small splash window (before the main shell).
 */
export function SplashScreen({ exiting = false }: SplashScreenProps) {
  const [logs, setLogs] = useState<string[]>(["booting…"])

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

  const visible = logs.slice(-MAX_VISIBLE)

  return (
    <div
      className={`app-draggable splash-screen flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background px-6 text-foreground ${
        exiting ? "splash-screen--exit" : ""
      }`}
    >
      <img
        src="/terra-logo.png"
        alt=""
        className="h-14 w-14 object-contain"
      />
      <div className="flex flex-col items-center gap-1.5">
        <p className="font-display text-lg font-semibold tracking-[0.18em]">TERRA</p>
        <p className="eyebrow">land cover · sentinel-2</p>
        <div className="mt-1 h-0.5 w-7 rounded-[1px] bg-accent/85" aria-hidden />
      </div>
      <ul className="app-no-drag mt-1 flex w-full max-w-[320px] flex-col gap-0.5 font-telemetry text-[10px] leading-relaxed tracking-wide text-muted-foreground">
        {visible.map((line, i) => (
          <li
            key={`${i}-${line}`}
            className={`truncate ${i === visible.length - 1 ? "text-foreground/80" : "opacity-55"}`}
            title={line}
          >
            {line}
          </li>
        ))}
      </ul>
      <span
        className="mt-1 h-1.5 w-1.5 animate-pulse rounded-[1px] bg-accent"
        aria-hidden
      />
    </div>
  )
}
