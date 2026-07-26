import { Map, UserRound, LogIn, Github, ChartColumn } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { cn } from "@/lib/utils"
import { AvatarCircle } from "@/components/AvatarCircle"

interface AppSidebarProps {
  onOpenRepo: () => void
  hasAnalysis?: boolean
}

export function AppSidebar({ onOpenRepo, hasAnalysis = false }: AppSidebarProps) {
  const { user, loading, screen, goMap, goAuth, goProfile, goAnalysis } = useAuth()

  return (
    <aside className="app-no-drag flex w-14 shrink-0 flex-col items-center bg-ink/30 py-3 backdrop-blur-md">
      <nav className="flex flex-1 flex-col items-center gap-1">
        <NavItem
          active={screen === "map"}
          title="Map"
          onClick={goMap}
          icon={<Map className="h-4 w-4" />}
        />
        <NavItem
          active={screen === "analysis"}
          title="Analysis"
          onClick={goAnalysis}
          icon={<ChartColumn className="h-4 w-4" />}
          badge={hasAnalysis}
        />
      </nav>

      <div className="mt-auto flex flex-col items-center gap-1">
        {!loading && (
          <NavItem
            active={screen === "auth" || screen === "profile"}
            title={user ? "Profile" : "Sign in"}
            onClick={() => (user ? goProfile() : goAuth())}
            icon={
              user?.avatar_uri ? (
                <AvatarCircle uri={user.avatar_uri} size="sm" />
              ) : user ? (
                <UserRound className="h-4 w-4" />
              ) : (
                <LogIn className="h-4 w-4" />
              )
            }
          />
        )}
        <NavItem
          active={false}
          title="Repository"
          onClick={onOpenRepo}
          icon={<Github className="h-4 w-4" />}
        />
      </div>
    </aside>
  )
}

function NavItem({
  active,
  title,
  onClick,
  icon,
  badge,
}: {
  active: boolean
  title: string
  onClick: () => void
  icon: React.ReactNode
  badge?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "relative flex h-10 w-10 items-center justify-center rounded-md transition-colors",
        active
          ? "bg-surface-raised/90 text-foreground"
          : "text-muted-foreground hover:bg-surface/50 hover:text-foreground"
      )}
    >
      {icon}
      {badge && !active && (
        <span className="absolute right-1.5 top-1.5 size-1.5 rounded-[1px] bg-primary" />
      )}
    </button>
  )
}
