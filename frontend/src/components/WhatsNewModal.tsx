import { useEffect } from "react"
import type { WhatsNewEntry } from "@/lib/whatsNew"

interface WhatsNewModalProps {
  currentVersion: string
  entries: WhatsNewEntry[]
  onContinue: () => void
}

export function WhatsNewModal({
  currentVersion,
  entries,
  onContinue,
}: WhatsNewModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault()
        onContinue()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onContinue])

  return (
    <div
      className="app-no-drag fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4"
      role="presentation"
      onClick={onContinue}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        className="terra-workspace flex w-full max-w-lg flex-col overflow-hidden rounded-sm border shadow-[0_16px_48px_rgba(0,0,0,0.55)]"
        style={{
          borderColor: "var(--ar-border)",
          background: "var(--ar-panel)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ar-header flex shrink-0 flex-col gap-1 px-4 py-3">
          <p className="telemetry text-[10px] text-primary">WHAT’S NEW</p>
          <h2
            id="whats-new-title"
            className="font-display text-lg font-semibold tracking-wide"
          >
            What’s new in {currentVersion}
          </h2>
          <p className="text-[11px] text-muted-foreground">
            Highlights since your last update.
          </p>
        </div>

        <div
          className="flex max-h-[min(28rem,60vh)] flex-col gap-3 overflow-y-auto p-4"
          style={{ background: "var(--ar-bg)" }}
        >
          {entries.map((entry) => (
            <section key={entry.version} className="ar-section p-4">
              <div className="mb-2 flex flex-wrap items-baseline gap-2">
                <p className="eyebrow !text-foreground">{entry.title}</p>
                <span className="telemetry text-[10px] text-muted-foreground">
                  v{entry.version}
                </span>
              </div>
              <ul className="flex list-disc flex-col gap-1.5 pl-4 text-[12px] text-muted-foreground">
                {entry.items.map((item) => (
                  <li key={item} className="marker:text-primary/80">
                    <span className="text-foreground/90">{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div
          className="flex shrink-0 justify-end px-4 py-3"
          style={{ borderTop: "1px solid var(--ar-border)" }}
        >
          <button
            type="button"
            autoFocus
            onClick={onContinue}
            className="flex h-8 items-center rounded-sm bg-primary px-4 text-[11px] font-semibold text-primary-foreground"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}
