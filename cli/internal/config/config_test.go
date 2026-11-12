package config

import (
	"os"
	"path/filepath"
	"testing"
)

func writeConfig(t *testing.T, body string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "config.toml")
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestLoadMissingFileReturnsDefault(t *testing.T) {
	cfg, err := Load(filepath.Join(t.TempDir(), "nope", "config.toml"))
	if err != nil {
		t.Fatalf("missing file should be non-fatal, got %v", err)
	}
	if cfg.APIURL != DefaultAPIURL {
		t.Fatalf("APIURL = %q, want default %q", cfg.APIURL, DefaultAPIURL)
	}
}

func TestLoadReadsAPIURL(t *testing.T) {
	path := writeConfig(t, `api_url = "http://localhost:8000"`+"\n")
	cfg, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.APIURL != "http://localhost:8000" {
		t.Fatalf("APIURL = %q", cfg.APIURL)
	}
}

func TestLoadTrimsTrailingSlash(t *testing.T) {
	cfg, err := Load(writeConfig(t, `api_url = "http://localhost:8000/"`))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.APIURL != "http://localhost:8000" {
		t.Fatalf("APIURL = %q", cfg.APIURL)
	}
}

func TestLoadEmptyFileKeepsDefault(t *testing.T) {
	cfg, err := Load(writeConfig(t, ""))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.APIURL != DefaultAPIURL {
		t.Fatalf("APIURL = %q, want default", cfg.APIURL)
	}
}

func TestLoadBlankAPIURLKeepsDefault(t *testing.T) {
	cfg, err := Load(writeConfig(t, `api_url = "  "`))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.APIURL != DefaultAPIURL {
		t.Fatalf("APIURL = %q, want default", cfg.APIURL)
	}
}

func TestLoadMalformedFileIsAnError(t *testing.T) {
	if _, err := Load(writeConfig(t, `api_url = "unterminated`)); err == nil {
		t.Fatal("expected a parse error for malformed TOML")
	}
}

func TestLoadUnknownKeyIsAnError(t *testing.T) {
	if _, err := Load(writeConfig(t, `api_ulr = "http://localhost:8000"`)); err == nil {
		t.Fatal("expected an error for a misspelled key")
	}
}

func TestDefaultPathHonorsXDG(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", "/tmp/xdg")
	got, err := DefaultPath()
	if err != nil {
		t.Fatal(err)
	}
	if want := filepath.Join("/tmp/xdg", "tend", "config.toml"); got != want {
		t.Fatalf("DefaultPath = %q, want %q", got, want)
	}
}

func TestDefaultPathUsesDotConfig(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", "")
	t.Setenv("HOME", "/home/someone")
	got, err := DefaultPath()
	if err != nil {
		t.Fatal(err)
	}
	if want := filepath.Join("/home/someone", ".config", "tend", "config.toml"); got != want {
		t.Fatalf("DefaultPath = %q, want %q", got, want)
	}
}
