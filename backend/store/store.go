package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite"
)

var (
	ErrNotFound       = errors.New("not found")
	ErrEmailTaken     = errors.New("email already registered")
	ErrInvalidCreds   = errors.New("invalid email or password")
	ErrUnauthorized   = errors.New("not authenticated")
	ErrInvalidInput   = errors.New("invalid input")
)

const sessionTTL = 30 * 24 * time.Hour

// User is the public user profile (no password hash).
type User struct {
	ID          string `json:"id"`
	Email       string `json:"email"`
	DisplayName string `json:"display_name"`
	AvatarPath  string `json:"avatar_path,omitempty"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}

// Preferences holds per-user UI/inference defaults.
type Preferences struct {
	UserID         string  `json:"user_id"`
	DefaultModel   string  `json:"default_model"`
	OverlayOpacity float64 `json:"overlay_opacity"`
	Theme          string  `json:"theme"`
	ExtrasJSON     string  `json:"extras_json,omitempty"`
}

// InferenceRun is a saved classification run summary.
type InferenceRun struct {
	ID             string `json:"id"`
	UserID         string `json:"user_id"`
	CreatedAt      string `json:"created_at"`
	ModelKind      string `json:"model_kind"`
	PeriodStart    string `json:"period_start"`
	PeriodEnd      string `json:"period_end"`
	PolygonGeoJSON string `json:"polygon_geojson"`
	Status         string `json:"status"`
	SummaryJSON    string `json:"summary"`
	OverlayRelPath string `json:"overlay_relpath,omitempty"`
	NDates         int    `json:"n_dates"`
}

// Store is the local SQLite-backed user database.
type Store struct {
	db      *sql.DB
	dataDir string
}

// Open creates (or opens) the app database under UserConfigDir/geosense-infer.
func Open() (*Store, error) {
	cfg, err := os.UserConfigDir()
	if err != nil {
		return nil, fmt.Errorf("user config dir: %w", err)
	}
	dataDir := filepath.Join(cfg, "geosense-infer")
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		return nil, fmt.Errorf("mkdir data dir: %w", err)
	}
	dbPath := filepath.Join(dataDir, "geosense.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	db.SetMaxOpenConns(1)
	s := &Store{db: db, dataDir: dataDir}
	if err := s.migrate(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) DataDir() string { return s.dataDir }

func (s *Store) Close() error {
	if s.db == nil {
		return nil
	}
	return s.db.Close()
}

func (s *Store) migrate() error {
	schema := `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  avatar_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  default_model TEXT NOT NULL DEFAULT 'spectral',
  overlay_opacity REAL NOT NULL DEFAULT 0.75,
  theme TEXT NOT NULL DEFAULT 'dark',
  extras_json TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS inference_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  model_kind TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  polygon_geojson TEXT NOT NULL,
  status TEXT NOT NULL,
  summary_json TEXT NOT NULL DEFAULT '{}',
  overlay_relpath TEXT,
  n_dates INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_runs_user_created ON inference_runs(user_id, created_at DESC);
`
	if _, err := s.db.Exec(schema); err != nil {
		return fmt.Errorf("migrate: %w", err)
	}
	return nil
}

func nowISO() string {
	return time.Now().UTC().Format(time.RFC3339)
}

func normalizeEmail(email string) string {
	return strings.TrimSpace(strings.ToLower(email))
}

// Register creates a user and default preferences; returns the user + session token.
func (s *Store) Register(email, password, displayName string) (*User, string, error) {
	email = normalizeEmail(email)
	displayName = strings.TrimSpace(displayName)
	if email == "" || len(password) < 6 || displayName == "" {
		return nil, "", ErrInvalidInput
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, "", err
	}
	id := uuid.NewString()
	ts := nowISO()
	_, err = s.db.Exec(
		`INSERT INTO users (id, email, display_name, password_hash, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		id, email, displayName, string(hash), ts, ts,
	)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			return nil, "", ErrEmailTaken
		}
		return nil, "", err
	}
	_, _ = s.db.Exec(
		`INSERT INTO preferences (user_id, default_model, overlay_opacity, theme, extras_json)
		 VALUES (?, 'spectral', 0.75, 'dark', '{}')`,
		id,
	)
	token, err := s.createSession(id)
	if err != nil {
		return nil, "", err
	}
	u := &User{ID: id, Email: email, DisplayName: displayName, CreatedAt: ts, UpdatedAt: ts}
	if err := s.writeSessionFile(token); err != nil {
		return u, token, nil // user created; session file is best-effort
	}
	return u, token, nil
}

// Login validates credentials and returns user + session token.
func (s *Store) Login(email, password string) (*User, string, error) {
	email = normalizeEmail(email)
	if email == "" || password == "" {
		return nil, "", ErrInvalidInput
	}
	var (
		u    User
		hash string
	)
	err := s.db.QueryRow(
		`SELECT id, email, display_name, COALESCE(avatar_path,''), password_hash, created_at, updated_at
		 FROM users WHERE email = ?`, email,
	).Scan(&u.ID, &u.Email, &u.DisplayName, &u.AvatarPath, &hash, &u.CreatedAt, &u.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, "", ErrInvalidCreds
	}
	if err != nil {
		return nil, "", err
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) != nil {
		return nil, "", ErrInvalidCreds
	}
	token, err := s.createSession(u.ID)
	if err != nil {
		return nil, "", err
	}
	_ = s.writeSessionFile(token)
	return &u, token, nil
}

func (s *Store) createSession(userID string) (string, error) {
	token := uuid.NewString()
	exp := time.Now().UTC().Add(sessionTTL).Format(time.RFC3339)
	_, err := s.db.Exec(
		`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`,
		token, userID, exp,
	)
	return token, err
}

func (s *Store) sessionFilePath() string {
	return filepath.Join(s.dataDir, "session.token")
}

func (s *Store) writeSessionFile(token string) error {
	return os.WriteFile(s.sessionFilePath(), []byte(token), 0o600)
}

func (s *Store) clearSessionFile() {
	_ = os.Remove(s.sessionFilePath())
}

// Logout invalidates the given session token (or the on-disk token if empty).
func (s *Store) Logout(token string) error {
	if token == "" {
		b, err := os.ReadFile(s.sessionFilePath())
		if err == nil {
			token = strings.TrimSpace(string(b))
		}
	}
	if token != "" {
		_, _ = s.db.Exec(`DELETE FROM sessions WHERE token = ?`, token)
	}
	s.clearSessionFile()
	return nil
}

// UserFromSession resolves a session token to a user.
func (s *Store) UserFromSession(token string) (*User, error) {
	if token == "" {
		return nil, ErrUnauthorized
	}
	var (
		u       User
		expires string
	)
	err := s.db.QueryRow(
		`SELECT u.id, u.email, u.display_name, COALESCE(u.avatar_path,''), u.created_at, u.updated_at, s.expires_at
		 FROM sessions s JOIN users u ON u.id = s.user_id
		 WHERE s.token = ?`, token,
	).Scan(&u.ID, &u.Email, &u.DisplayName, &u.AvatarPath, &u.CreatedAt, &u.UpdatedAt, &expires)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrUnauthorized
	}
	if err != nil {
		return nil, err
	}
	exp, err := time.Parse(time.RFC3339, expires)
	if err != nil || time.Now().UTC().After(exp) {
		_, _ = s.db.Exec(`DELETE FROM sessions WHERE token = ?`, token)
		return nil, ErrUnauthorized
	}
	return &u, nil
}

// RestoreSession reads the on-disk token and returns the user if still valid.
func (s *Store) RestoreSession() (*User, string, error) {
	b, err := os.ReadFile(s.sessionFilePath())
	if err != nil {
		return nil, "", ErrUnauthorized
	}
	token := strings.TrimSpace(string(b))
	u, err := s.UserFromSession(token)
	if err != nil {
		s.clearSessionFile()
		return nil, "", err
	}
	return u, token, nil
}

// UpdateProfile updates display name (and optional avatar path).
func (s *Store) UpdateProfile(userID, displayName, avatarPath string) (*User, error) {
	displayName = strings.TrimSpace(displayName)
	if userID == "" || displayName == "" {
		return nil, ErrInvalidInput
	}
	ts := nowISO()
	_, err := s.db.Exec(
		`UPDATE users SET display_name = ?, avatar_path = ?, updated_at = ? WHERE id = ?`,
		displayName, nullIfEmpty(avatarPath), ts, userID,
	)
	if err != nil {
		return nil, err
	}
	return s.GetUser(userID)
}

func nullIfEmpty(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}

func (s *Store) GetUser(id string) (*User, error) {
	var u User
	err := s.db.QueryRow(
		`SELECT id, email, display_name, COALESCE(avatar_path,''), created_at, updated_at
		 FROM users WHERE id = ?`, id,
	).Scan(&u.ID, &u.Email, &u.DisplayName, &u.AvatarPath, &u.CreatedAt, &u.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (s *Store) GetPreferences(userID string) (*Preferences, error) {
	var p Preferences
	err := s.db.QueryRow(
		`SELECT user_id, default_model, overlay_opacity, theme, extras_json
		 FROM preferences WHERE user_id = ?`, userID,
	).Scan(&p.UserID, &p.DefaultModel, &p.OverlayOpacity, &p.Theme, &p.ExtrasJSON)
	if errors.Is(err, sql.ErrNoRows) {
		p = Preferences{
			UserID: userID, DefaultModel: "spectral", OverlayOpacity: 0.75,
			Theme: "dark", ExtrasJSON: "{}",
		}
		_, _ = s.db.Exec(
			`INSERT INTO preferences (user_id, default_model, overlay_opacity, theme, extras_json)
			 VALUES (?, ?, ?, ?, ?)`,
			p.UserID, p.DefaultModel, p.OverlayOpacity, p.Theme, p.ExtrasJSON,
		)
		return &p, nil
	}
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *Store) SavePreferences(p Preferences) error {
	if p.UserID == "" {
		return ErrInvalidInput
	}
	if p.DefaultModel == "" {
		p.DefaultModel = "spectral"
	}
	if p.Theme == "" {
		p.Theme = "dark"
	}
	if p.ExtrasJSON == "" {
		p.ExtrasJSON = "{}"
	}
	if p.OverlayOpacity <= 0 || p.OverlayOpacity > 1 {
		p.OverlayOpacity = 0.75
	}
	_, err := s.db.Exec(
		`INSERT INTO preferences (user_id, default_model, overlay_opacity, theme, extras_json)
		 VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(user_id) DO UPDATE SET
		   default_model = excluded.default_model,
		   overlay_opacity = excluded.overlay_opacity,
		   theme = excluded.theme,
		   extras_json = excluded.extras_json`,
		p.UserID, p.DefaultModel, p.OverlayOpacity, p.Theme, p.ExtrasJSON,
	)
	return err
}

// SaveRun inserts an inference run for the user.
func (s *Store) SaveRun(run InferenceRun) (*InferenceRun, error) {
	if run.UserID == "" {
		return nil, ErrInvalidInput
	}
	if run.ID == "" {
		run.ID = uuid.NewString()
	}
	if run.CreatedAt == "" {
		run.CreatedAt = nowISO()
	}
	if run.Status == "" {
		run.Status = "ok"
	}
	if run.SummaryJSON == "" {
		run.SummaryJSON = "{}"
	}
	if !json.Valid([]byte(run.SummaryJSON)) {
		run.SummaryJSON = "{}"
	}
	_, err := s.db.Exec(
		`INSERT INTO inference_runs
		 (id, user_id, created_at, model_kind, period_start, period_end, polygon_geojson, status, summary_json, overlay_relpath, n_dates)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		run.ID, run.UserID, run.CreatedAt, run.ModelKind, run.PeriodStart, run.PeriodEnd,
		run.PolygonGeoJSON, run.Status, run.SummaryJSON, nullIfEmpty(run.OverlayRelPath), run.NDates,
	)
	if err != nil {
		return nil, err
	}
	return &run, nil
}

func (s *Store) ListRuns(userID string, limit int) ([]InferenceRun, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	rows, err := s.db.Query(
		`SELECT id, user_id, created_at, model_kind, period_start, period_end, polygon_geojson,
		        status, summary_json, COALESCE(overlay_relpath,''), n_dates
		 FROM inference_runs WHERE user_id = ?
		 ORDER BY created_at DESC LIMIT ?`,
		userID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []InferenceRun{}
	for rows.Next() {
		var r InferenceRun
		if err := rows.Scan(
			&r.ID, &r.UserID, &r.CreatedAt, &r.ModelKind, &r.PeriodStart, &r.PeriodEnd,
			&r.PolygonGeoJSON, &r.Status, &r.SummaryJSON, &r.OverlayRelPath, &r.NDates,
		); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
