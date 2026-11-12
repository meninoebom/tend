# tend CLI

Go command-line client for Tend. See
`docs/plans/2026-08-20-feat-tend-cli-architecture.md` (Go CLI phase, #234 to #239).

This is the scaffold only: root command, config loading, and `--version`.
Login, token storage, the HTTP client, and task commands land in follow-up issues.

## Build and test

`cli/` is its own Go module, so run Go commands from inside it (the mise tasks do this). There is deliberately no root `go.work`: a root Go file appeared to break the Railway frontend preview build (see PR #246).

```bash
mise run cli:build        # -> cli/bin/tend, version from `git describe`
mise run cli:test         # go vet + go test, from cli/

# or by hand
cd cli
go build -ldflags "-X main.version=v0.1.0" -o bin/tend ./cmd/tend
bin/tend --version    # tend v0.1.0
```

A plain `go build ./cmd/tend` (inside `cli/`) produces a `tend` binary that reports version `dev`.

## Config

Non-secret settings live in `~/.config/tend/config.toml` (or
`$XDG_CONFIG_HOME/tend/config.toml`). Override the path with `--config`.

```toml
api_url = "http://localhost:8000"
```

| Key       | Default                          |
|-----------|----------------------------------|
| `api_url` | `https://api.tendyourgarden.app` |

A missing file is fine; defaults apply. A file that exists but does not parse is an error.
Tokens are never stored here.

## Layout

```
cli/
  cmd/tend/main.go         entrypoint; `version` set via -ldflags
  internal/cmd/            cobra command tree (root.go; subcommands attach here)
  internal/config/         config.toml loader
```
