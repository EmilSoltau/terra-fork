//go:build darwin

package main

import (
	"fmt"
	"os"
	"os/exec"
	"strconv"
)

// focusApp brings TERRA to the foreground on macOS after the splash→main handoff.
func focusApp() {
	pid := strconv.Itoa(os.Getpid())
	script := fmt.Sprintf(
		`tell application "System Events" to set frontmost of first process whose unix id is %s to true`,
		pid,
	)
	_ = exec.Command("osascript", "-e", script).Run()
}
