package store

import (
	"errors"
	"strings"
	"testing"
)

func TestUpdateProjectOverlayMeta(t *testing.T) {
	s := openTestStore(t)

	proj, err := s.CreateProject(Project{UserID: LocalUserID, Name: "AOI"})
	if err != nil {
		t.Fatal(err)
	}
	ov, err := s.AddProjectOverlay(LocalUserID, ProjectOverlay{
		ProjectID: proj.ID,
		Kind:      "extract",
		Title:     "Iron oxide",
		MetaJSON:  `{"index":"iron_oxide","opacity":0.85,"visible":true}`,
	})
	if err != nil {
		t.Fatal(err)
	}

	// Update opacity + visibility.
	newMeta := `{"index":"iron_oxide","opacity":0.4,"visible":false}`
	if err := s.UpdateProjectOverlayMeta(LocalUserID, ov.ID, newMeta); err != nil {
		t.Fatalf("update failed: %v", err)
	}

	rows, err := s.ListProjectOverlays(LocalUserID, proj.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 {
		t.Fatalf("expected 1 overlay, got %d", len(rows))
	}
	if !strings.Contains(rows[0].MetaJSON, `"opacity":0.4`) || !strings.Contains(rows[0].MetaJSON, `"visible":false`) {
		t.Fatalf("meta not updated: %s", rows[0].MetaJSON)
	}

	// Invalid JSON falls back to "{}" rather than erroring.
	if err := s.UpdateProjectOverlayMeta(LocalUserID, ov.ID, "not json"); err != nil {
		t.Fatalf("invalid-json update should not error: %v", err)
	}
	rows, _ = s.ListProjectOverlays(LocalUserID, proj.ID)
	if strings.TrimSpace(rows[0].MetaJSON) != "{}" {
		t.Fatalf("invalid json should reset meta to {}, got %s", rows[0].MetaJSON)
	}

	// Unknown id → ErrNotFound.
	if err := s.UpdateProjectOverlayMeta(LocalUserID, "no-such-id", "{}"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound for unknown id, got %v", err)
	}

	// Overlay owned by another user → ErrNotFound (not silently updated).
	other, _, err := s.Register("other@example.com", "pw123456", "Other")
	if err != nil {
		t.Fatal(err)
	}
	if err := s.UpdateProjectOverlayMeta(other.ID, ov.ID, "{}"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound for non-owner, got %v", err)
	}
}
