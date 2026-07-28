"""tend — a small CLI over the Tend API.

One artifact, two callers. A human types `tend add "call the dentist #health"`;
an agent runs the same binary through a shell and passes --json to read
structured output back. That is why there is no separate machine interface: the
CLI *is* the integration surface, and it works anywhere a shell does.

Auth is a personal access token (Settings → API tokens). Tokens can create, read
and modify, but deliberately cannot delete tasks or domains or touch account
settings — see the PAT policy in backend/tests/test_api_tokens.py.
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any

from tend_cli.client import DEFAULT_API_URL, TOKEN_PREFIX, TendClient, TendError, write_config
from tend_cli.grammar import parse_capture

BUCKETS = ("today", "soon", "later", "someday")

# Mirrors the web app's triage keys (components/triage-card.tsx) so the two
# don't need separate muscle memory.
TRIAGE_KEYS = {
    "t": ("confirm", None),
    "s": ("defer", "soon"),
    "l": ("defer", "later"),
    "o": ("defer", "someday"),
    "d": ("complete", None),
    "x": ("kill", None),
}


# ── output ────────────────────────────────────────────────────────────────────


def _tty() -> bool:
    return sys.stdout.isatty()


def dim(text: str) -> str:
    return f"\033[2m{text}\033[0m" if _tty() else text


def bold(text: str) -> str:
    return f"\033[1m{text}\033[0m" if _tty() else text


def emit_json(payload: Any) -> None:
    json.dump(payload, sys.stdout, indent=2, default=str)
    sys.stdout.write("\n")


def short_id(task: dict) -> str:
    return str(task["id"])[:8]


def marks(task: dict) -> str:
    out = "★" if task.get("is_mit") else ""
    if task.get("important") and task.get("urgent"):
        out += "!!"
    elif task.get("important"):
        out += "!"
    elif task.get("urgent"):
        out += "u"
    return out


def format_task(task: dict, *, show_bucket: bool = False) -> str:
    meta = []
    if show_bucket:
        meta.append(str(task["bucket"]))
    if task.get("domain"):
        meta.append(str(task["domain"]["name"]))
    if task.get("size"):
        meta.append(str(task["size"]).upper())
    age = task.get("age_days")
    if isinstance(age, int) and age > 0:
        meta.append(f"{age}d")
    if task.get("reschedule_count"):
        meta.append(f"deferred {task['reschedule_count']}x")
    if task.get("placement"):
        meta.append(f"blocked {task['placement'].get('block_start', '')}".strip())

    flag = marks(task)
    line = f"  {dim(short_id(task))}  {flag + ' ' if flag else ''}{task['text']}"
    if meta:
        line += f"  {dim('· ' + ' · '.join(meta))}"
    return line


# ── shared helpers ────────────────────────────────────────────────────────────


def resolve_task(client: TendClient, ref: str, tasks: list[dict] | None = None) -> dict:
    """Find a task by full id, id prefix, or unique text substring.

    UUIDs are unusable by hand, so `tend done a3f2` and `tend done dentist` both
    work. Ambiguity is always an error rather than a guess — picking the wrong
    task silently is worse than making the caller be specific.
    """
    candidates = client.tasks(status="pending") if tasks is None else tasks
    lowered = ref.lower()

    for task in candidates:
        if str(task["id"]) == ref:
            return task

    def _one(matches: list[dict], how: str) -> dict | None:
        if len(matches) == 1:
            return matches[0]
        if len(matches) > 1:
            listing = "\n".join(format_task(t, show_bucket=True) for t in matches[:10])
            raise TendError(f'"{ref}" matches {len(matches)} tasks by {how}:\n{listing}')
        return None

    found = _one([t for t in candidates if str(t["id"]).lower().startswith(lowered)], "id")
    if found:
        return found
    found = _one([t for t in candidates if lowered in str(t["text"]).lower()], "text")
    if found:
        return found

    raise TendError(f'No pending task matches "{ref}".')


# ── commands ──────────────────────────────────────────────────────────────────


def cmd_login(args: argparse.Namespace) -> int:
    token = args.token or input("Paste your Tend API token: ").strip()
    if not token:
        raise TendError("No token entered.")
    if not token.startswith(TOKEN_PREFIX):
        raise TendError(f"That doesn't look like a Tend token (expected {TOKEN_PREFIX}...).")

    api_url = args.api_url or DEFAULT_API_URL
    client = TendClient(base_url=api_url.rstrip("/"), token=token)
    client.state()  # fail now, with a clear message, rather than on first real use

    path = write_config(token, api_url)
    print(f"Token saved to {path}")
    return 0


def cmd_add(client: TendClient, args: argparse.Namespace) -> int:
    raw = " ".join(args.text).strip()
    if not raw:
        raise TendError("Nothing to add.")

    # Only pay for the domain list when the text could actually bind one.
    domains = client.domains() if "#" in raw else []
    parsed = parse_capture(raw, domains)
    if not parsed.text:
        raise TendError("That's all tokens and no task text.")

    payload: dict[str, Any] = {
        "text": parsed.text,
        # Capture defaults to `soon`, not `today`. Deciding something belongs in
        # today is what triage is for; a terminal capture shouldn't quietly add
        # to a day you already committed to. Use -b today (or >today) to mean it.
        "bucket": args.bucket or parsed.bucket or "soon",
        "important": parsed.important,
        "urgent": parsed.urgent,
    }
    if parsed.domain_id:
        payload["domain_id"] = parsed.domain_id
    if parsed.size:
        payload["size"] = parsed.size

    task = client.create_task(payload)
    if args.json:
        emit_json(task)
    else:
        print(f"Added to {bold(str(task['bucket']))}:")
        print(format_task(task))
    return 0


def cmd_ls(client: TendClient, args: argparse.Namespace) -> int:
    tasks = client.tasks(bucket=args.bucket, status=args.status or "pending")

    if args.domain:
        needle = args.domain.lower()
        tasks = [
            t
            for t in tasks
            if t.get("domain") and str(t["domain"]["name"]).lower().startswith(needle)
        ]

    if args.json:
        emit_json(tasks)
        return 0

    if not tasks:
        print(dim("Nothing here."))
        return 0

    by_bucket: dict[str, list[dict]] = {}
    for task in tasks:
        by_bucket.setdefault(str(task["bucket"]), []).append(task)

    for bucket in BUCKETS:
        group = by_bucket.get(bucket)
        if not group:
            continue
        print(f"\n{bold(bucket)}  {dim(f'({len(group)})')}")
        for task in group:
            print(format_task(task))
            for child in task.get("children") or []:
                print(f"    {dim('└')} {child['text']}")
    print()
    return 0


def cmd_done(client: TendClient, args: argparse.Namespace) -> int:
    task = resolve_task(client, args.ref)
    done = client.complete_task(str(task["id"]))
    if args.json:
        emit_json(done)
    else:
        print(f"Done: {task['text']}")
    return 0


def cmd_state(client: TendClient, args: argparse.Namespace) -> int:
    state = client.state()
    if args.json:
        emit_json(state)
        return 0

    buckets = state["buckets"]
    priority = state["priority"]
    print(f"\n{bold('Buckets')}")
    for name in (*BUCKETS, "done"):
        print(f"  {name:<9} {buckets.get(name, 0)}")
    print(f"\n{bold('Priority')}  {dim('(pending, top-level)')}")
    for label, key in (
        ("important + urgent", "q1_count"),
        ("important", "q2_count"),
        ("urgent", "q3_count"),
        ("neither", "q4_count"),
    ):
        print(f"  {label:<20} {priority.get(key, 0)}")
    print()
    return 0


def cmd_domains(client: TendClient, args: argparse.Namespace) -> int:
    domains = client.domains()
    if args.json:
        emit_json(domains)
        return 0
    if not domains:
        print(dim("No domains yet."))
        return 0
    for domain in domains:
        print(f"  {dim(str(domain['id'])[:8])}  {domain['name']}  {dim(domain['color'])}")
    return 0


def _triage_payload(action: str, bucket: str | None) -> dict:
    payload: dict[str, Any] = {"action": action}
    if action == "defer":
        if bucket is None:
            raise TendError("defer needs a bucket, e.g. --bucket later")
        payload["bucket"] = bucket
    return payload


def cmd_triage(client: TendClient, args: argparse.Namespace) -> int:
    # One decision, no prompting — the shape an agent uses. Resolved against all
    # pending tasks rather than today's queue, because POST /triage/{id} has no
    # queue-membership requirement either. A task captured today won't be in the
    # queue until tomorrow (creation stamps triaged_at), and you should still be
    # able to name it.
    if args.ref:
        if not args.action:
            raise TendError("Pass an action, e.g. tend triage a3f2 defer --bucket later")
        task = resolve_task(client, args.ref)
        result = client.triage(str(task["id"]), _triage_payload(args.action, args.bucket))
        if args.json:
            emit_json(result)
        else:
            remaining = result.get("remaining")
            left = dim(f"({remaining} left)") if remaining is not None else ""
            print(f"{args.action}: {task['text']}  {left}".rstrip())
        return 0

    queue = client.triage_queue()
    tasks = queue["tasks"]

    # Read the queue without acting.
    if args.list or args.json:
        if args.json:
            emit_json(queue)
        elif not tasks:
            print(dim("Nothing to triage."))
        else:
            print(f"\n{bold(f'{len(tasks)} to triage')}")
            for task in tasks:
                print(format_task(task, show_bucket=True))
            print()
        return 0

    # Human path: walk the queue.
    if not tasks:
        print(dim("Nothing to triage. "), end="")
        print("Your queue is clear.")
        return 0

    if not sys.stdin.isatty():
        raise TendError(
            "Interactive triage needs a terminal. Use --list to read the queue, or\n"
            "  tend triage <ref> <action> [--bucket ...]  to make one decision."
        )

    print(
        f"\n{bold(f'{len(tasks)} to triage')}  {dim('t=today s=soon l=later o=someday d=done x=let go q=quit')}"
    )
    for index, task in enumerate(tasks, start=1):
        print(f"\n{dim(f'[{index}/{len(tasks)}]')} {format_task(task, show_bucket=True).strip()}")
        while True:
            try:
                key = input("  > ").strip().lower()
            except (EOFError, KeyboardInterrupt):
                print("\nStopped.")
                return 0
            if key in ("q", "quit"):
                print(dim(f"Stopped with {len(tasks) - index + 1} left."))
                return 0
            if key in TRIAGE_KEYS:
                action, bucket = TRIAGE_KEYS[key]
                client.triage(str(task["id"]), _triage_payload(action, bucket))
                break
            print(dim("  t=today s=soon l=later o=someday d=done x=let go q=quit"))

    print(f"\n{bold('Triage complete.')}\n")
    return 0


# ── entry point ───────────────────────────────────────────────────────────────


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="tend", description="Tend from the command line.")
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument(
        "--json", action="store_true", help="emit raw JSON (for scripts and agents)"
    )

    sub = parser.add_subparsers(dest="command", required=True)

    p_login = sub.add_parser("login", help="store an API token")
    p_login.add_argument("token", nargs="?", help="token; prompted for if omitted")
    p_login.add_argument("--api-url", help=f"API base URL (default {DEFAULT_API_URL})")
    p_login.set_defaults(needs_client=False, func=cmd_login)

    p_add = sub.add_parser(
        "add",
        parents=[common],
        help="capture a task",
        description=(
            "Inline tokens: #domain, ! important, !! important+urgent, u! urgent, "
            ">today|soon|later|someday, ~s|~m|~l size. Defaults to the soon bucket."
        ),
    )
    p_add.add_argument("text", nargs="+")
    p_add.add_argument("-b", "--bucket", choices=BUCKETS, help="override the bucket")
    p_add.set_defaults(func=cmd_add)

    p_ls = sub.add_parser("ls", parents=[common], help="list tasks")
    p_ls.add_argument("-b", "--bucket", choices=BUCKETS)
    p_ls.add_argument("-d", "--domain", help="filter by domain name prefix")
    p_ls.add_argument(
        "-s", "--status", choices=("pending", "complete", "archived"), help="default pending"
    )
    p_ls.set_defaults(func=cmd_ls)

    p_done = sub.add_parser("done", parents=[common], help="complete a task")
    p_done.add_argument("ref", help="task id, id prefix, or unique text substring")
    p_done.set_defaults(func=cmd_done)

    p_triage = sub.add_parser("triage", parents=[common], help="walk the triage queue")
    p_triage.add_argument("ref", nargs="?", help="triage a single task instead of looping")
    p_triage.add_argument("action", nargs="?", choices=("confirm", "defer", "complete", "kill"))
    p_triage.add_argument("-b", "--bucket", choices=BUCKETS, help="destination for defer")
    p_triage.add_argument("--list", action="store_true", help="show the queue without acting")
    p_triage.set_defaults(func=cmd_triage)

    p_state = sub.add_parser("state", parents=[common], help="counts by bucket and priority")
    p_state.set_defaults(func=cmd_state)

    p_domains = sub.add_parser("domains", parents=[common], help="list domains")
    p_domains.set_defaults(func=cmd_domains)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if getattr(args, "needs_client", True):
            return args.func(TendClient.from_env(), args)
        return args.func(args)
    except TendError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
