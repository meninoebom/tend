package main

import (
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// TestLdflagsVersion builds the real binary with -X main.version and runs
// --version, so renaming `version` (or making it a const) breaks a test
// instead of silently shipping "dev".
func TestLdflagsVersion(t *testing.T) {
	if testing.Short() {
		t.Skip("builds a binary")
	}
	bin := filepath.Join(t.TempDir(), "tend")
	build := exec.Command("go", "build", "-ldflags", "-X main.version=v0.0.0-test", "-o", bin, ".")
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("go build: %v\n%s", err, out)
	}
	out, err := exec.Command(bin, "--version").CombinedOutput()
	if err != nil {
		t.Fatalf("tend --version: %v\n%s", err, out)
	}
	if got := strings.TrimSpace(string(out)); got != "tend v0.0.0-test" {
		t.Fatalf("--version = %q", got)
	}
}
