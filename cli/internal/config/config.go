// Package config loads the tend CLI's non-secret settings from
// ~/.config/tend/config.toml. Secrets (tokens) never live here; they go in
// the OS keychain.
package config

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/BurntSushi/toml"
)

// DefaultAPIURL is the public Tend API host the CLI talks to when no
// config file overrides it.
const DefaultAPIURL = "https://api.tendyourgarden.app"

// Config is the parsed contents of config.toml.
type Config struct {
	APIURL string `toml:"api_url"`
}

// Default returns the config used when no file exists.
func Default() Config {
	return Config{APIURL: DefaultAPIURL}
}

// DefaultPath returns ~/.config/tend/config.toml, honoring $XDG_CONFIG_HOME
// when it is set. It deliberately does not use os.UserConfigDir, which maps
// to ~/Library/Application Support on macOS.
func DefaultPath() (string, error) {
	if xdg := os.Getenv("XDG_CONFIG_HOME"); xdg != "" {
		return filepath.Join(xdg, "tend", "config.toml"), nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("locating home directory: %w", err)
	}
	return filepath.Join(home, ".config", "tend", "config.toml"), nil
}

// Load reads the config at path. A missing file is not an error: it yields
// Default(). Keys absent from the file keep their defaults. A file that
// exists but cannot be parsed is an error, so a typo is never silently
// ignored. Unknown keys are
// an error for the same reason (`api_ulr` must not silently fall back to prod).
func Load(path string) (Config, error) {
	cfg := Default()
	data, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return cfg, nil
	}
	if err != nil {
		return cfg, fmt.Errorf("reading config %s: %w", path, err)
	}
	meta, err := toml.Decode(string(data), &cfg)
	if err != nil {
		return Default(), fmt.Errorf("parsing config %s: %w", path, err)
	}
	if undecoded := meta.Undecoded(); len(undecoded) > 0 {
		keys := make([]string, len(undecoded))
		for i, k := range undecoded {
			keys[i] = k.String()
		}
		return Default(), fmt.Errorf("config %s: unknown key(s): %s", path, strings.Join(keys, ", "))
	}
	cfg.APIURL = strings.TrimRight(strings.TrimSpace(cfg.APIURL), "/")
	if cfg.APIURL == "" {
		cfg.APIURL = DefaultAPIURL
	}
	return cfg, nil
}
