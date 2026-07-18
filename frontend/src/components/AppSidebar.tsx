import { Map, UserRound, LogIn, Github } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { cn } from "@/lib/utils"
import { AvatarCircle } from "@/components/AvatarCircle"

interface AppSidebarProps {
  onOpenRepo: () => void
}

export function AppSidebar({ onOpenRepo }: AppSidebarProps) {
  const { user, loading, screen, goMap, goAuth, goProfile } = useAuth()

  return (
    <aside className="app-no-drag flex w-14 shrink-0 flex-col items-center border-r border-border bg-card/50 py-3 backdrop-blur">
      <nav className="flex flex-1 flex-col items-center gap-1">
        <NavItem
          active={screen === "map"}
          title="Map"
          onClick={goMap}
          icon={<Map className="h-4 w-4" />}
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
}: {
  active: boolean
  title: string
  onClick: () => void
  icon: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "relative flex h-10 w-10 items-center justify-center rounded-sm transition-colors",
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-primary" />
      )}
      {icon}
    </button>
  )
}
