package cmd

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"

	"github.com/meninoebom/tend/cli/internal/config"
)

func run(t *testing.T, version string, args ...string) (string, *App, error) {
	t.Helper()
	root, app := NewRoot(version)
	var out bytes.Buffer
	root.SetOut(&out)
	root.SetErr(&out)
	root.SetArgs(args)
	err := root.Execute()
	return out.String(), app, err
}

func TestVersionFlagPrintsInjectedVersion(t *testing.T) {
	out, _, err := run(t, "1.2.3", "--version")
	if err != nil {
		t.Fatal(err)
	}
	if out != "tend 1.2.3\n" {
		t.Fatalf("output = %q", out)
	}
}

func TestRootLoadsConfigFromFlag(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.toml")
	if err := os.WriteFile(path, []byte(`api_url = "http://localhost:8000"`), 0o600); err != nil {
		t.Fatal(err)
	}
	_, app, err := run(t, "dev", "--config", path)
	if err != nil {
		t.Fatal(err)
	}
	if app.Config.APIURL != "http://localhost:8000" {
		t.Fatalf("APIURL = %q", app.Config.APIURL)
	}
}

func TestRootMissingConfigIsNonFatal(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	_, app, err := run(t, "dev")
	if err != nil {
		t.Fatalf("missing config should be non-fatal: %v", err)
	}
	if app.Config.APIURL != config.DefaultAPIURL {
		t.Fatalf("APIURL = %q", app.Config.APIURL)
	}
}

func TestRootMalformedConfigFails(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.toml")
	if err := os.WriteFile(path, []byte(`api_url = `), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, _, err := run(t, "dev", "--config", path); err == nil {
		t.Fatal("expected error for malformed config")
	}
}
