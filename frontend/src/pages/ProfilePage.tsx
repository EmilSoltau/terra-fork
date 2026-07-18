import { useEffect, useRef, useState } from "react"
import { Camera, History, LogOut, Save, Trash2, UserRound } from "lucide-react"
import { useAuth } from "@/lib/auth"

const MAX_AVATAR_BYTES = 2_000_000

export function ProfilePage() {
  const {
    user,
    runs,
    logout,
    updateProfile,
    setAvatar,
    clearAvatar,
    refreshRuns,
    goAuth,
  } = useAuth()
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!user) {
      goAuth()
      return
    }
    setName(user.display_name)
    void refreshRuns()
  }, [user, goAuth, refreshRuns])

  if (!user) return null

  const save = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      await updateProfile(name.trim())
    } finally {
      setBusy(false)
    }
  }

  const onPickPhoto = async (file: File | null) => {
    if (!file) return
    if (!file.type.startsWith("image/")) {
      return
    }
    if (file.size > MAX_AVATAR_BYTES) {
      return
    }
    setBusy(true)
    try {
      const dataURI = await readAsDataURL(file)
      await setAvatar(dataURI)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  return (
    <div className="app-no-drag flex h-full min-h-0 flex-col overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-8">
        <div className="flex items-center gap-4">
          <AvatarCircle uri={user.avatar_uri} size="lg" />
          <div>
            <p className="telemetry text-[10px] text-primary">PROFILE</p>
            <h1 className="mt-1 text-xl font-semibold tracking-wide">{user.display_name}</h1>
            <p className="mt-1 text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>

        <section className="rounded-md border border-border bg-card/40 p-5">
          <p className="eyebrow mb-3">Photo</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => void onPickPhoto(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="flex h-8 items-center gap-1.5 rounded-sm border border-border px-3 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-60"
            >
              <Camera className="h-3 w-3" />
              Upload photo
            </button>
            {user.avatar_uri && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void clearAvatar()}
                className="flex h-8 items-center gap-1.5 rounded-sm border border-border px-3 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-60"
              >
                <Trash2 className="h-3 w-3" />
                Remove
              </button>
            )}
            <span className="text-[10px] text-muted-foreground">PNG, JPEG or WebP · max 2 MB</span>
          </div>
        </section>

        <section className="rounded-md border border-border bg-card/40 p-5">
          <p className="eyebrow mb-3">Account</p>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="eyebrow">Display name</span>
              <input
                className="field-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="eyebrow">Email</span>
              <input className="field-input opacity-70" value={user.email} readOnly />
            </label>
            <button
              type="button"
              disabled={busy || !name.trim()}
              onClick={() => void save()}
              className="flex h-9 w-fit items-center justify-center gap-1.5 rounded-sm bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            >
              <Save className="h-3 w-3" />
              Save profile
            </button>
          </div>
        </section>

        <section className="rounded-md border border-border bg-card/40 p-5">
          <div className="mb-3 flex items-center gap-2">
            <History className="h-3.5 w-3.5 text-primary" />
            <p className="eyebrow !text-foreground">Recent classification runs</p>
          </div>
          {runs.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No saved runs yet. Classify an area on the map while signed in.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {runs.map((r) => (
                <li
                  key={r.id}
                  className="rounded-sm border border-border/60 bg-secondary/30 px-3 py-2.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-foreground">{r.model_kind}</span>
                    <span className="telemetry text-muted-foreground">{r.n_dates} scenes</span>
                  </div>
                  <div className="mt-0.5 text-muted-foreground">
                    {r.period_start} → {r.period_end}
                  </div>
                  <div className="telemetry mt-1 text-[10px] text-muted-foreground/80">
                    {new Date(r.created_at).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <button
          type="button"
          onClick={() => void logout()}
          className="flex h-9 w-fit items-center justify-center gap-1.5 rounded-sm border border-border px-4 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <LogOut className="h-3 w-3" />
          Sign out
        </button>
      </div>
    </div>
  )
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function AvatarCircle({
  uri,
  size = "md",
}: {
  uri?: string
  size?: "sm" | "md" | "lg"
}) {
  const dim = size === "lg" ? "h-16 w-16" : size === "sm" ? "h-7 w-7" : "h-10 w-10"
  if (uri) {
    return (
      <img
        src={uri}
        alt=""
        className={`${dim} shrink-0 rounded-full border border-border object-cover`}
      />
    )
  }
  return (
    <span
      className={`${dim} flex shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-muted-foreground`}
    >
      <UserRound className={size === "lg" ? "h-7 w-7" : "h-3.5 w-3.5"} />
    </span>
  )
}
