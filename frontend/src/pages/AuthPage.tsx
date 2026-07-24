import { useState } from "react"
import { LogIn, UserPlus } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { cn } from "@/lib/utils"

export function AuthPage() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<"login" | "register">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setBusy(true)
    try {
      if (mode === "login") {
        await login(email.trim(), password)
      } else {
        await register(email.trim(), password, displayName.trim())
      }
    } catch (err) {
      setError(String(err).replace(/^Error:\s*/i, ""))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-no-drag flex h-full min-h-0 flex-col overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-10">
        <div>
          <p className="telemetry text-[10px] text-primary">AUTH</p>
          <h1 className="mt-1 font-display text-xl font-semibold tracking-wide">
            {mode === "login" ? "Sign in" : "Create account"}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Local account stored on this machine. No cloud sync.
          </p>
        </div>

        <div className="flex gap-1 rounded-sm bg-secondary/60 p-0.5">
          <TabButton active={mode === "login"} onClick={() => setMode("login")} icon={<LogIn className="h-3 w-3" />}>
            Login
          </TabButton>
          <TabButton
            active={mode === "register"}
            onClick={() => setMode("register")}
            icon={<UserPlus className="h-3 w-3" />}
          >
            Register
          </TabButton>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3 rounded-md border border-border bg-card/40 p-5">
          {mode === "register" && (
            <Field label="Display name">
              <input
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="field-input"
                placeholder="Your name"
                autoComplete="name"
              />
            </Field>
          )}
          <Field label="Email">
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field-input"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </Field>
          <Field label="Password">
            <input
              required
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field-input"
              placeholder="Min. 6 characters"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </Field>

          {error && <p className="text-[11px] text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="mt-1 flex h-9 items-center justify-center rounded-sm bg-primary text-xs font-semibold tracking-wide text-primary-foreground disabled:opacity-60"
          >
            {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="eyebrow">{label}</span>
      {children}
    </label>
  )
}

function TabButton({
  active,
  onClick,
  children,
  icon,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  icon: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-sm py-2 text-[11px] font-medium transition-colors",
        active ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      {children}
    </button>
  )
}
