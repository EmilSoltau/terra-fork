import { useMemo, useState } from "react"
import { FolderKanban, Inbox, Plus, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Project } from "@/lib/types"
import { ProjectFolderCard } from "@/components/ProjectFolderCard"

export function ProjectsHub({
  projects,
  unassignedCount,
  creating,
  newName,
  onNewNameChange,
  onCreate,
  onOpenProject,
  onOpenUnassigned,
}: {
  projects: Project[]
  unassignedCount: number
  creating: boolean
  newName: string
  onNewNameChange: (value: string) => void
  onCreate: () => void
  onOpenProject: (projectId: string) => void
  onOpenUnassigned: () => void
}) {
  const [query, setQuery] = useState("")
  const [showCreate, setShowCreate] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return projects
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.label?.toLowerCase().includes(q) ?? false)
    )
  }, [projects, query])

  return (
    <div className="flex min-h-0 flex-1 gap-0 overflow-hidden rounded-md border border-border bg-card/30">
      {/* Left rail */}
      <aside className="flex w-[15.5rem] shrink-0 flex-col border-r border-border/70 bg-secondary/15">
        <div className="border-b border-border/50 p-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects…"
              className="h-8 w-full rounded-sm border border-border bg-background/60 py-0 pl-8 pr-2 text-[11px] outline-none placeholder:text-muted-foreground/70 focus:border-primary"
            />
          </label>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
          <p className="eyebrow mb-1.5 px-1.5 !text-muted-foreground">Projects</p>
          <ul className="flex flex-col gap-0.5">
            {filtered.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onOpenProject(p.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[11px]",
                    "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                  )}
                >
                  <FolderKanban className="h-3 w-3 shrink-0 text-primary/80" />
                  <span className="truncate">{p.name}</span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-2 py-2 text-[10px] text-muted-foreground">
                {projects.length === 0 ? "No projects yet" : "No matches"}
              </li>
            )}
          </ul>

          <button
            type="button"
            onClick={onOpenUnassigned}
            className={cn(
              "mt-2 flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[11px]",
              "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
            )}
          >
            <Inbox className="h-3 w-3 shrink-0" />
            <span className="truncate">
              Unassigned{unassignedCount > 0 ? ` (${unassignedCount})` : ""}
            </span>
          </button>
        </div>

        <div className="border-t border-border/50 p-2">
          {!showCreate ? (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex h-8 w-full items-center justify-center gap-1.5 rounded-sm border border-border/70 text-[11px] text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
            >
              <Plus className="h-3 w-3" />
              New project
            </button>
          ) : (
            <div className="flex flex-col gap-1.5">
              <input
                value={newName}
                onChange={(e) => onNewNameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onCreate()
                  if (e.key === "Escape") {
                    setShowCreate(false)
                    onNewNameChange("")
                  }
                }}
                autoFocus
                placeholder="Project name"
                className="h-8 w-full rounded-sm border border-border bg-background/60 px-2 text-[11px] outline-none focus:border-primary"
              />
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={creating || !newName.trim()}
                  onClick={onCreate}
                  className="flex h-7 flex-1 items-center justify-center gap-1 rounded-sm bg-primary text-[10px] font-semibold text-primary-foreground disabled:opacity-50"
                >
                  <Plus className="h-3 w-3" />
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreate(false)
                    onNewNameChange("")
                  }}
                  className="h-7 rounded-sm border border-border px-2 text-[10px] text-muted-foreground hover:bg-secondary/40"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main grid */}
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-5 sm:p-6">
        <div className="mb-5 shrink-0">
          <h2 className="font-display text-lg font-semibold tracking-wide">
            Projects
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Farm and field workspaces — analyses and overlays stay together.
          </p>
        </div>

        {filtered.length === 0 ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-sm border border-dashed border-border/70 bg-secondary/10 px-6 py-16 text-center">
            <FolderKanban className="mb-3 h-8 w-8 text-primary/70" />
            <p className="text-sm text-foreground">
              {projects.length === 0 ? "No projects yet" : "No matching projects"}
            </p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              {projects.length === 0
                ? "Create a project so classifications and compositions stay organized by field."
                : "Try a different search term."}
            </p>
            {projects.length === 0 && (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="mt-4 flex h-9 items-center gap-1.5 rounded-sm bg-primary px-4 text-xs font-semibold text-primary-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                New project
              </button>
            )}
          </div>
        ) : (
          <ul className="grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((p) => (
              <li key={p.id} className="min-h-[11rem]">
                <ProjectFolderCard
                  project={p}
                  onOpen={() => onOpenProject(p.id)}
                  className="h-full min-h-[11rem]"
                />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
