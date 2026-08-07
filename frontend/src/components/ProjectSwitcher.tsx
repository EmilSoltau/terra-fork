import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { FolderKanban, ChevronDown, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Project } from "@/lib/types"

export function ProjectSwitcher({
  projects,
  activeProjectId,
  onSelect,
  onCreate,
  onOpenHub,
  className,
}: {
  projects: Project[]
  activeProjectId: string | null
  onSelect: (id: string | null) => void
  onCreate: () => void
  onOpenHub?: () => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null
  )
  const btnRef = useRef<HTMLButtonElement>(null)
  const active = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId]
  )

  const updatePos = () => {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setMenuPos({ top: r.bottom + 4, left: r.left })
  }

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null)
      return
    }
    updatePos()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onReposition = () => updatePos()
    window.addEventListener("resize", onReposition)
    window.addEventListener("scroll", onReposition, true)
    return () => {
      window.removeEventListener("resize", onReposition)
      window.removeEventListener("scroll", onReposition, true)
    }
  }, [open])

  const menu =
    open &&
    menuPos &&
    createPortal(
      <>
        <button
          type="button"
          className="fixed inset-0 z-[5000] cursor-default"
          aria-label="Close project menu"
          onClick={() => setOpen(false)}
        />
        <div
          className="panel fixed z-[5001] w-56 overflow-hidden rounded-sm border border-border/70 shadow-lg"
          style={{ top: menuPos.top, left: menuPos.left }}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-[11px] hover:bg-secondary/50"
            onClick={() => {
              onSelect(null)
              setOpen(false)
            }}
          >
            <span className="flex-1 text-muted-foreground">No project</span>
            {!activeProjectId && <Check className="size-3 text-primary" />}
          </button>
          <hr className="hairline" />
          <div className="max-h-48 overflow-y-auto">
            {projects.length === 0 ? (
              <p className="px-2.5 py-2 text-[10px] text-muted-foreground">
                No projects yet.
              </p>
            ) : (
              projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-[11px] hover:bg-secondary/50"
                  onClick={() => {
                    onSelect(p.id)
                    setOpen(false)
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {activeProjectId === p.id && (
                    <Check className="size-3 shrink-0 text-primary" />
                  )}
                </button>
              ))
            )}
          </div>
          <hr className="hairline" />
          <button
            type="button"
            className="flex w-full px-2.5 py-2 text-left text-[11px] text-primary hover:bg-secondary/50"
            onClick={() => {
              setOpen(false)
              onCreate()
            }}
          >
            New project…
          </button>
          {onOpenHub && (
            <button
              type="button"
              className="flex w-full px-2.5 py-2 text-left text-[11px] text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
              onClick={() => {
                setOpen(false)
                onOpenHub()
              }}
            >
              Open projects hub
            </button>
          )}
        </div>
      </>,
      document.body
    )

  return (
    <div className={cn("relative app-no-drag", className)}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="panel flex max-w-[14rem] items-center gap-1.5 rounded-sm px-2 py-1 text-left text-[11px] text-foreground hover:bg-secondary/40"
        title="Active project"
      >
        <FolderKanban className="size-3.5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate">
          {active ? active.name : "No project"}
        </span>
        <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
      </button>
      {menu}
    </div>
  )
}
