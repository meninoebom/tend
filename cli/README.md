# tend — command-line client

One binary for two callers. A human types `tend add "call the dentist #health"`; an agent runs
the same command through a shell and passes `--json` to read structured output back. There is no
separate machine interface because there doesn't need to be one — a CLI works anywhere a shell
does, which includes every agent harness, cron, and shell script.

## Install

```bash
uv tool install ./cli          # from the repo root
# or, for development
cd cli && uv sync && uv run tend --help
```

## Auth

Create a token in Tend under **Settings → API tokens**, then:

```bash
tend login                            # stores it in ~/.config/tend/config.json (chmod 600)
export TEND_TOKEN=tend_pat_...        # or just set it for this shell
export TEND_API_URL=http://localhost:8000   # point at a local backend
```

Tokens **can** create, read, and modify. They **cannot** delete tasks or domains, change account
settings, or mint more tokens — those need a browser session. A token sits in plaintext in config
files and agent settings, so anything irreversible stays behind the session. The full policy is
data, in `backend/tests/test_api_tokens.py`.

## Commands

```bash
tend add "file the appellate brief #work !! ~s"   # capture
tend ls [-b today] [-d work] [-s archived]        # list
tend done <ref>                                   # complete
tend triage                                       # walk the queue interactively
tend triage --list                                # read the queue without acting
tend triage <ref> defer --bucket later            # one decision, no prompting
tend state                                        # counts by bucket and priority
tend domains
```

`<ref>` is a task id, an id prefix (`a3f2`), or a unique text substring (`dentist`). Ambiguity is
always an error listing the candidates, never a guess.

Every read command takes `--json`.

## Capture grammar

The same inline tokens the web app understands, parsed client-side by `grammar.py`:

| Token | Effect |
| --- | --- |
| `#health` | domain, prefix-matched against your domain names |
| `!` | important |
| `!!` | important + urgent |
| `u!` or `!u` | urgent |
| `>today` `>soon` `>later` `>someday` | bucket |
| `~s` `~m` `~l` | size |

Unrecognized tokens are left in the text verbatim, so `renew the domain #nonsense` stays intact.

Parsing is client-side, matching the browser. It's an input affordance, not a security boundary —
whatever it produces still goes through the API's own validation. `grammar.py` is a deliberate
line-by-line port of `frontend/src/lib/parse-capture.ts`, and `tests/test_grammar.py` mirrors the
frontend's cases so the two can't quietly diverge. **Change one, change both.**

## Why `add` defaults to `soon`

Deciding something belongs in *today* is what triage is for. A capture typed into a terminal
shouldn't quietly add to a day you already committed to, so `tend add` lands in `soon` and waits
for tomorrow's triage. Say `-b today` or `>today` when you actually mean it.

(Note that a task captured today won't appear in *today's* triage queue either way — creation
stamps `triaged_at`, so it surfaces tomorrow. That's the app's design, not the CLI's.)

## Interactive triage

`tend triage` walks the queue with the same keys as the web app's keyboard triage, so there's one
set of muscle memory:

```
t = today    s = soon    l = later    o = someday    d = done    x = let go    q = quit
```

`x` ("let go") is a reversible soft-archive, not a delete — archived tasks stay recoverable via
`tend ls --status archived` and on the Someday page.

Interactive mode requires a terminal. Without one, use `--list` or the single-decision form, so an
agent that runs bare `tend triage` gets a clear error rather than a hang.

## Tests

```bash
cd cli && uv run pytest
```
