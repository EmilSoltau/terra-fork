import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { toast } from "sonner"
import {
  ClearAvatar,
  CurrentUser,
  GetPreferences,
  ListRuns,
  Login,
  Logout,
  Register,
  SavePreferences,
  SetAvatar,
  UpdateProfile,
} from "../../wailsjs/go/main/App"
import type { InferenceRun, Preferences, User } from "@/lib/types"

export type AppScreen = "map" | "auth" | "profile" | "analysis"

interface AuthContextValue {
  user: User | null
  prefs: Preferences | null
  runs: InferenceRun[]
  loading: boolean
  screen: AppScreen
  goMap: () => void
  goAuth: () => void
  goProfile: () => void
  goAnalysis: () => void
  navigate: (screen: AppScreen) => void
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, displayName: string) => Promise<void>
  logout: () => Promise<void>
  updateProfile: (displayName: string) => Promise<void>
  setAvatar: (dataURI: string) => Promise<void>
  clearAvatar: () => Promise<void>
  savePrefs: (prefs: Preferences) => Promise<void>
  refreshRuns: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({
  children,
  onPrefsApplied,
}: {
  children: ReactNode
  onPrefsApplied?: (p: Preferences) => void
}) {
  const [user, setUser] = useState<User | null>(null)
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [runs, setRuns] = useState<InferenceRun[]>([])
  const [loading, setLoading] = useState(true)
  const [screen, setScreen] = useState<AppScreen>("map")

  const refreshRuns = useCallback(async () => {
    try {
      const r = (await ListRuns(20)) as unknown as InferenceRun[]
      setRuns(r ?? [])
    } catch {
      setRuns([])
    }
  }, [])

  const loadPrefsAndRuns = useCallback(
    async (u: User) => {
      try {
        const p = (await GetPreferences()) as unknown as Preferences
        setPrefs(p)
        onPrefsApplied?.(p)
      } catch {
        setPrefs(null)
      }
      await refreshRuns()
      void u
    },
    [onPrefsApplied, refreshRuns]
  )

  useEffect(() => {
    CurrentUser()
      .then(async (u) => {
        const raw = u as User | null
        const next = raw?.id ? raw : null
        setUser(next)
        if (next) await loadPrefsAndRuns(next)
        else await refreshRuns()
      })
      .catch(async () => {
        setUser(null)
        await refreshRuns()
      })
      .finally(() => setLoading(false))
  }, [loadPrefsAndRuns, refreshRuns])

  const login = useCallback(
    async (email: string, password: string) => {
      const u = (await Login(email, password)) as unknown as User
      setUser(u)
      await loadPrefsAndRuns(u)
      setScreen("map")
      toast.success(`Welcome back, ${u.display_name}.`)
    },
    [loadPrefsAndRuns]
  )

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      const u = (await Register(email, password, displayName)) as unknown as User
      setUser(u)
      await loadPrefsAndRuns(u)
      setScreen("map")
      toast.success("Account created.")
    },
    [loadPrefsAndRuns]
  )

  const logout = useCallback(async () => {
    await Logout()
    setUser(null)
    setPrefs(null)
    setScreen("map")
    toast.success("Signed out.")
    await refreshRuns()
  }, [refreshRuns])

  const updateProfile = useCallback(async (displayName: string) => {
    const u = (await UpdateProfile(displayName)) as unknown as User
    setUser(u)
    toast.success("Profile updated.")
  }, [])

  const setAvatar = useCallback(async (dataURI: string) => {
    const u = (await SetAvatar(dataURI)) as unknown as User
    setUser(u)
    toast.success("Photo updated.")
  }, [])

  const clearAvatar = useCallback(async () => {
    const u = (await ClearAvatar()) as unknown as User
    setUser(u)
    toast.success("Photo removed.")
  }, [])

  const savePrefs = useCallback(
    async (p: Preferences) => {
      await SavePreferences(p as never)
      setPrefs(p)
      onPrefsApplied?.(p)
      toast.success("Preferences saved.")
    },
    [onPrefsApplied]
  )

  const goProfile = useCallback(() => {
    setScreen(user ? "profile" : "auth")
  }, [user])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      prefs,
      runs,
      loading,
      screen,
      goMap: () => setScreen("map"),
      goAuth: () => setScreen("auth"),
      goProfile,
      goAnalysis: () => setScreen("analysis"),
      navigate: setScreen,
      login,
      register,
      logout,
      updateProfile,
      setAvatar,
      clearAvatar,
      savePrefs,
      refreshRuns,
    }),
    [
      user,
      prefs,
      runs,
      loading,
      screen,
      goProfile,
      login,
      register,
      logout,
      updateProfile,
      setAvatar,
      clearAvatar,
      savePrefs,
      refreshRuns,
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
