package token

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/zalando/go-keyring"
)

// Every test must install a keyring mock first: go-keyring's provider is a
// package global, and an un-mocked test would read and write the developer's
// real keychain. For the same reason these tests do not use t.Parallel().

const sample = "tend_pat_abc123secret"

var errNoKeychain = errors.New("dbus: no session bus available")

func newStore(t *testing.T) *Store {
	t.Helper()
	return New(filepath.Join(t.TempDir(), "tend"))
}

func TestKeychainRoundTrip(t *testing.T) {
	keyring.MockInit()
	s := newStore(t)

	where, err := s.Save(sample)
	if err != nil {
		t.Fatal(err)
	}
	if where != BackendKeychain {
		t.Fatalf("Save backend = %q, want keychain", where)
	}
	if _, err := os.Stat(s.FilePath()); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("token file should not exist when the keychain works, stat err = %v", err)
	}

	got, err := s.Load()
	if err != nil {
		t.Fatal(err)
	}
	if got != sample {
		t.Fatalf("Load = %q, want %q", got, sample)
	}

	if err := s.Delete(); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Load(); !errors.Is(err, ErrNotFound) {
		t.Fatalf("Load after Delete err = %v, want ErrNotFound", err)
	}
}

func TestFileFallbackWhenKeychainUnavailable(t *testing.T) {
	keyring.MockInitWithError(errNoKeychain)
	s := newStore(t)

	where, err := s.Save(sample)
	if err != nil {
		t.Fatal(err)
	}
	if where != BackendFile {
		t.Fatalf("Save backend = %q, want file", where)
	}

	got, err := s.Load()
	if err != nil {
		t.Fatal(err)
	}
	if got != sample {
		t.Fatalf("Load = %q, want %q", got, sample)
	}

	if err := s.Delete(); err != nil {
		t.Fatalf("Delete with an unavailable keychain should succeed, got %v", err)
	}
	if _, err := os.Stat(s.FilePath()); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("token file should be gone after Delete, stat err = %v", err)
	}
	if _, err := s.Load(); !errors.Is(err, ErrNotFound) {
		t.Fatalf("Load after Delete err = %v, want ErrNotFound", err)
	}
}

func TestFallbackFilePermissions(t *testing.T) {
	keyring.MockInitWithError(errNoKeychain)
	s := newStore(t)

	if _, err := s.Save(sample); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(s.FilePath())
	if err != nil {
		t.Fatal(err)
	}
	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Fatalf("token file perm = %o, want 600", perm)
	}
	dirInfo, err := os.Stat(s.Dir())
	if err != nil {
		t.Fatal(err)
	}
	if perm := dirInfo.Mode().Perm(); perm != 0o700 {
		t.Fatalf("config dir perm = %o, want 700", perm)
	}
}

func TestFallbackTightensExistingLoosePermissions(t *testing.T) {
	keyring.MockInitWithError(errNoKeychain)
	s := newStore(t)
	if err := os.MkdirAll(s.Dir(), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(s.FilePath(), []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}

	if _, err := s.Save(sample); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(s.FilePath())
	if err != nil {
		t.Fatal(err)
	}
	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Fatalf("token file perm = %o, want 600 after overwrite", perm)
	}
}

func TestTokenNeverWrittenToConfigToml(t *testing.T) {
	for name, setup := range map[string]func(){
		"keychain": keyring.MockInit,
		"file":     func() { keyring.MockInitWithError(errNoKeychain) },
	} {
		t.Run(name, func(t *testing.T) {
			setup()
			s := newStore(t)
			if err := os.MkdirAll(s.Dir(), 0o700); err != nil {
				t.Fatal(err)
			}
			cfgPath := filepath.Join(s.Dir(), "config.toml")
			if err := os.WriteFile(cfgPath, []byte(`api_url = "http://localhost:8000"`+"\n"), 0o600); err != nil {
				t.Fatal(err)
			}

			if _, err := s.Save(sample); err != nil {
				t.Fatal(err)
			}

			entries, err := os.ReadDir(s.Dir())
			if err != nil {
				t.Fatal(err)
			}
			for _, e := range entries {
				if e.Name() == filepath.Base(s.FilePath()) {
					continue
				}
				data, err := os.ReadFile(filepath.Join(s.Dir(), e.Name()))
				if err != nil {
					t.Fatal(err)
				}
				if strings.Contains(string(data), sample) {
					t.Fatalf("token leaked into %s", e.Name())
				}
			}
		})
	}
}

func TestDeleteWhenNothingStored(t *testing.T) {
	keyring.MockInit()
	if err := newStore(t).Delete(); err != nil {
		t.Fatalf("Delete with nothing stored should succeed, got %v", err)
	}
}

func TestLoadWhenNothingStored(t *testing.T) {
	keyring.MockInit()
	if _, err := newStore(t).Load(); !errors.Is(err, ErrNotFound) {
		t.Fatalf("Load err = %v, want ErrNotFound", err)
	}
}

func TestLoadWhenNothingStoredAndKeychainUnavailable(t *testing.T) {
	keyring.MockInitWithError(errNoKeychain)
	if _, err := newStore(t).Load(); !errors.Is(err, ErrNotFound) {
		t.Fatalf("Load err = %v, want ErrNotFound", err)
	}
}

func TestSaveRejectsEmptyToken(t *testing.T) {
	keyring.MockInit()
	for _, tok := range []string{"", "   ", "\n"} {
		if _, err := newStore(t).Save(tok); err == nil {
			t.Fatalf("Save(%q) should fail", tok)
		}
	}
}

func TestSaveToKeychainRemovesStaleFallbackFile(t *testing.T) {
	keyring.MockInitWithError(errNoKeychain)
	s := newStore(t)
	if _, err := s.Save("tend_pat_old"); err != nil {
		t.Fatal(err)
	}

	keyring.MockInit()
	if _, err := s.Save(sample); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(s.FilePath()); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("stale token file should be removed, stat err = %v", err)
	}
	got, err := s.Load()
	if err != nil {
		t.Fatal(err)
	}
	if got != sample {
		t.Fatalf("Load = %q, want new token", got)
	}
}

func TestLoadFallsBackToFileWhenKeychainEmpty(t *testing.T) {
	// A token saved headlessly must still load once a keychain appears.
	keyring.MockInitWithError(errNoKeychain)
	s := newStore(t)
	if _, err := s.Save(sample); err != nil {
		t.Fatal(err)
	}

	keyring.MockInit()
	got, err := s.Load()
	if err != nil {
		t.Fatal(err)
	}
	if got != sample {
		t.Fatalf("Load = %q, want %q", got, sample)
	}
	if err := s.Delete(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(s.FilePath()); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("Delete should remove the fallback file too")
	}
}

func TestFileTokenIsTrimmed(t *testing.T) {
	keyring.MockInitWithError(errNoKeychain)
	s := newStore(t)
	if err := os.MkdirAll(s.Dir(), 0o700); err != nil {
		t.Fatal(err)
	}
	// Someone hand-wrote the file with `echo`, adding a newline.
	if err := os.WriteFile(s.FilePath(), []byte(sample+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := s.Load()
	if err != nil {
		t.Fatal(err)
	}
	if got != sample {
		t.Fatalf("Load = %q, want trimmed %q", got, sample)
	}
}

func TestErrorsDoNotContainToken(t *testing.T) {
	keyring.MockInitWithError(errNoKeychain)
	// Make the directory unwritable by putting a file where the dir should be.
	parent := t.TempDir()
	blocker := filepath.Join(parent, "tend")
	if err := os.WriteFile(blocker, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	_, err := New(blocker).Save(sample)
	if err == nil {
		t.Fatal("expected Save to fail when the config dir is a file")
	}
	if strings.Contains(err.Error(), sample) {
		t.Fatalf("error message leaks the token: %v", err)
	}
}

func TestResolvePrefersEnv(t *testing.T) {
	keyring.MockInit()
	s := newStore(t)
	if _, err := s.Save(sample); err != nil {
		t.Fatal(err)
	}

	t.Setenv(EnvVar, "tend_pat_from_env")
	got, src, err := s.Resolve()
	if err != nil {
		t.Fatal(err)
	}
	if got != "tend_pat_from_env" || src != SourceEnv {
		t.Fatalf("Resolve = %q, %q; want env token", got, src)
	}

	t.Setenv(EnvVar, "")
	got, src, err = s.Resolve()
	if err != nil {
		t.Fatal(err)
	}
	if got != sample || src != SourceStore {
		t.Fatalf("Resolve = %q, %q; want stored token", got, src)
	}
}

func TestDefaultDirMatchesConfigDir(t *testing.T) {
	t.Setenv("XDG_CONFIG_HOME", "/tmp/xdg")
	got, err := DefaultDir()
	if err != nil {
		t.Fatal(err)
	}
	if want := filepath.Join("/tmp/xdg", "tend"); got != want {
		t.Fatalf("DefaultDir = %q, want %q", got, want)
	}
}
