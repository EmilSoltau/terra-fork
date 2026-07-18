package store

import (
  "fmt"
  "os"
  "path/filepath"
  "testing"
)

func TestRegisterLoginPrefsRuns(t *testing.T) {
  tmp := t.TempDir()
  // Open uses UserConfigDir; override HOME/XDG for test
  t.Setenv("HOME", tmp)
  t.Setenv("XDG_CONFIG_HOME", filepath.Join(tmp, "config"))
  s, err := Open()
  if err != nil { t.Fatal(err) }
  defer s.Close()
  email := fmt.Sprintf("t%d@ex.com", os.Getpid())
  u, _, err := s.Register(email, "secret12", "Tester")
  if err != nil { t.Fatal(err) }
  if u.DisplayName != "Tester" { t.Fatal(u) }
  _, _, err = s.Login(email, "wrong")
  if err == nil { t.Fatal("expected bad login") }
  u2, tok, err := s.Login(email, "secret12")
  if err != nil { t.Fatal(err) }
  if tok == "" { t.Fatal("empty token") }
  p, err := s.GetPreferences(u2.ID)
  if err != nil { t.Fatal(err) }
  p.DefaultModel = "prithvi"
  if err := s.SavePreferences(*p); err != nil { t.Fatal(err) }
  _, err = s.SaveRun(InferenceRun{
    UserID: u2.ID, ModelKind: "spectral", PeriodStart: "2024-01-01", PeriodEnd: "2024-12-31",
    PolygonGeoJSON: "{}", Status: "ok", SummaryJSON: "{}", NDates: 2,
  })
  if err != nil { t.Fatal(err) }
  runs, err := s.ListRuns(u2.ID, 10)
  if err != nil || len(runs) != 1 { t.Fatalf("runs=%v err=%v", runs, err) }
}
