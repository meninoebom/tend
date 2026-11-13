// Package token stores the tend CLI's personal access token (tend_pat_...).
//
// The token lives in the OS keychain (macOS Keychain, Linux Secret Service,
// Windows Credential Manager) via zalando/go-keyring. When no keychain is
// reachable (headless Linux, CI, containers) it falls back to a 0600 file
// named "token" in the config directory, next to config.toml. The token is
// never written to config.toml, and no function here logs it or puts it in
// an error message.
package token

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"github.com/meninoebom/tend/cli/internal/config"
	"github.com/zalando/go-keyring"
)

const (
	// keychainService and keychainUser identify the single keychain entry.
	// There is one token per machine user, so the account name is fixed.
	keychainService = "tend-cli"
	keychainUser    = "personal-access-token"

	// fileName is the fallback file inside the config directory.
	fileName = "token"

	// EnvVar overrides any stored token when set (see Resolve).
	EnvVar = "TEND_TOKEN"
)

// ErrNotFound means no token is stored anywhere: the user is not logged in.
var ErrNotFound = errors.New("no tend token stored")

// Backend names where Save put the token.
type Backend string

const (
	BackendKeychain Backend = "keychain"
	BackendFile     Backend = "file"
)

// Source names where Resolve found the token.
type Source string

const (
	SourceEnv   Source = "env"
	SourceStore Source = "store"
)

// Store reads and writes the token. dir is the config directory that holds
// config.toml and, when the keychain is unavailable, the token file.
type Store struct {
	dir string
}

// New returns a Store whose fallback file lives in dir.
func New(dir string) *Store {
	return &Store{dir: dir}
}

// DefaultDir is the directory holding the default config.toml
// (~/.config/tend, or $XDG_CONFIG_HOME/tend).
func DefaultDir() (string, error) {
	p, err := config.DefaultPath()
	if err != nil {
		return "", err
	}
	return filepath.Dir(p), nil
}

// Dir returns the config directory the fallback file lives in.
func (s *Store) Dir() string { return s.dir }

// FilePath returns the path of the fallback token file.
func (s *Store) FilePath() string { return filepath.Join(s.dir, fileName) }

// Save stores tok in the keychain, or in the fallback file when the keychain
// is unavailable, and reports which one it used. A successful keychain save
// removes any stale fallback file so the two never disagree.
func (s *Store) Save(tok string) (Backend, error) {
	tok = strings.TrimSpace(tok)
	if tok == "" {
		return "", errors.New("token is empty")
	}
	if err := keyring.Set(keychainService, keychainUser, tok); err == nil {
		if err := removeIfExists(s.FilePath()); err != nil {
			return BackendKeychain, fmt.Errorf("removing stale token file: %w", err)
		}
		return BackendKeychain, nil
	}
	// Falling back: Load checks the keychain first, so an older token still
	// held there would shadow the new file. Clear it, and refuse to report
	// success if it is still readable.
	_ = keyring.Delete(keychainService, keychainUser)
	if old, gerr := keyring.Get(keychainService, keychainUser); gerr == nil && strings.TrimSpace(old) != "" {
		return "", errors.New("keychain rejected the new token but still holds an old one; remove it from the keychain and retry")
	}
	if err := s.writeFile(tok); err != nil {
		return "", err
	}
	return BackendFile, nil
}

// Load returns the stored token, checking the keychain first and then the
// fallback file. It returns an error wrapping ErrNotFound when neither holds
// a token.
func (s *Store) Load() (string, error) {
	tok, kerr := keyring.Get(keychainService, keychainUser)
	if kerr == nil && strings.TrimSpace(tok) != "" {
		return strings.TrimSpace(tok), nil
	}

	data, err := os.ReadFile(s.FilePath())
	if err == nil {
		if tok := strings.TrimSpace(string(data)); tok != "" {
			return tok, nil
		}
	} else if !errors.Is(err, fs.ErrNotExist) {
		return "", fmt.Errorf("reading token file %s: %w", s.FilePath(), err)
	}

	if kerr != nil && !errors.Is(kerr, keyring.ErrNotFound) {
		return "", fmt.Errorf("%w (keychain unavailable: %v)", ErrNotFound, kerr)
	}
	return "", ErrNotFound
}

// Delete removes the token from both the keychain and the fallback file.
// Nothing stored is not an error, and neither is an unavailable keychain
// (nothing can be stored in a keychain that cannot be reached).
func (s *Store) Delete() error {
	fileErr := removeIfExists(s.FilePath())

	kerr := keyring.Delete(keychainService, keychainUser)
	if kerr != nil && !errors.Is(kerr, keyring.ErrNotFound) {
		// Distinguish "keychain unreachable" (fine) from "entry exists but
		// could not be deleted" (not fine: the user would stay logged in).
		if _, gerr := keyring.Get(keychainService, keychainUser); gerr == nil {
			return fmt.Errorf("deleting token from keychain: %w", kerr)
		}
	}
	if fileErr != nil {
		return fmt.Errorf("removing token file: %w", fileErr)
	}
	return nil
}

// Resolve returns the token to use for a request: $TEND_TOKEN when set,
// otherwise the stored token.
func (s *Store) Resolve() (string, Source, error) {
	if tok := strings.TrimSpace(os.Getenv(EnvVar)); tok != "" {
		return tok, SourceEnv, nil
	}
	tok, err := s.Load()
	if err != nil {
		return "", "", err
	}
	return tok, SourceStore, nil
}

// writeFile atomically writes tok to the fallback file with 0600 perms,
// creating the config directory 0700 if needed. Writing to a temp file and
// renaming means an existing file with looser perms is replaced, not reused.
func (s *Store) writeFile(tok string) error {
	if err := os.MkdirAll(s.dir, 0o700); err != nil {
		return fmt.Errorf("creating config dir %s: %w", s.dir, err)
	}
	tmp, err := os.CreateTemp(s.dir, ".token-*")
	if err != nil {
		return fmt.Errorf("creating token file in %s: %w", s.dir, err)
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName) // no-op after a successful rename

	if err := tmp.Chmod(0o600); err != nil {
		tmp.Close()
		return fmt.Errorf("setting token file permissions: %w", err)
	}
	if _, err := tmp.WriteString(tok + "\n"); err != nil {
		tmp.Close()
		return fmt.Errorf("writing token file: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("writing token file: %w", err)
	}
	if err := os.Rename(tmpName, s.FilePath()); err != nil {
		return fmt.Errorf("saving token file %s: %w", s.FilePath(), err)
	}
	return nil
}

func removeIfExists(path string) error {
	if err := os.Remove(path); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	return nil
}
