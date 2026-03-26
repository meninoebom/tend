import logging
from collections import Counter
from datetime import UTC, datetime

from app.models.domain import Domain
from app.models.task import Task

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are Tend's AI companion. Tend is a conscious todo app that values "
    "honesty over productivity guilt.\n\n"
    "You have access to the user's current tasks, domains, and productivity stats. "
    "Use this to give grounded, specific advice. Reference tasks by name.\n\n"
    "Your personality:\n"
    "- Honest and direct — no cheerleading, no guilt trips\n"
    "- Laconic — say what needs to be said, then stop\n"
    "- Observant — notice patterns (frequently deferred tasks, empty domains, "
    "overloaded days)\n"
    "- Supportive without being sycophantic\n\n"
    "You are NOT a generic chatbot. You know this user's tasks and patterns. "
    "Be specific. If they ask what to focus on, name the task. If they ask about "
    "patterns, cite the data.\n\n"
    "Keep responses concise — 2-4 sentences unless the user asks for detail."
)


def get_anthropic_client():
    """Return an Anthropic client if API key is configured, else None."""
    try:
        from app.core.config import settings

        api_key = getattr(settings, "anthropic_api_key", "")
        if not api_key:
            return None
        import anthropic

        return anthropic.Anthropic(api_key=api_key)
    except Exception:
        return None


def assemble_chat_context(
    tasks: list[Task],
    domains: list[Domain],
    nudge_stats: dict,
    mit_task: Task | None,
) -> str:
    """Build a context block from the user's task data for the AI prompt."""
    lines = []

    # Overall counts
    pending = [t for t in tasks if t.status.value == "pending"]
    completed = [t for t in tasks if t.status.value == "complete"]
    lines.append(f"Total tasks: {len(tasks)} ({len(pending)} pending, {len(completed)} complete)")

    # MIT
    if mit_task:
        lines.append(f'Most important task today: "{mit_task.text}"')

    # Tasks by bucket
    bucket_counts: Counter = Counter()
    for t in pending:
        bucket_counts[t.bucket] += 1
    if bucket_counts:
        parts = [f"{b}: {c}" for b, c in bucket_counts.items()]
        lines.append(f"Pending by bucket: {', '.join(parts)}")

    # Domain distribution
    domain_counts: Counter = Counter()
    no_domain = 0
    for t in pending:
        if t.domain is not None:
            domain_counts[t.domain.name] += 1
        else:
            no_domain += 1
    if domain_counts:
        parts = [f"{name}: {count}" for name, count in domain_counts.most_common()]
        lines.append(f"Pending by domain: {', '.join(parts)}")
    if no_domain:
        lines.append(f"No domain assigned: {no_domain}")

    # All domains
    if domains:
        domain_names = [d.name for d in domains]
        lines.append(f"User's domains: {', '.join(domain_names)}")

    # Frequently deferred
    deferred = [t for t in pending if t.reschedule_count >= 2]
    if deferred:
        defer_lines = [
            f'- "{t.text}" (deferred {t.reschedule_count} times)'
            for t in sorted(deferred, key=lambda t: t.reschedule_count, reverse=True)[:5]
        ]
        lines.append("Frequently deferred:\n" + "\n".join(defer_lines))

    # Task list
    if pending:
        task_lines = []
        for t in pending:
            domain_str = f" [{t.domain.name}]" if t.domain else ""
            now = datetime.now(UTC).replace(tzinfo=None)
            age = (now - t.created_at).days if t.created_at else 0
            task_lines.append(
                f"- {t.text} ({t.bucket}{domain_str}, {age}d old, deferred {t.reschedule_count}x)"
            )
        lines.append("Pending tasks:\n" + "\n".join(task_lines))

    # Stats
    avg = nudge_stats.get("average_completed", 0)
    today_count = nudge_stats.get("today_count", 0)
    completed_count = nudge_stats.get("completed_count", 0)
    lines.append(f"Today: {today_count} tasks added, {completed_count} completed so far")
    lines.append(f"30-day completion average: {avg}")

    return "\n".join(lines)


def _build_messages(
    tasks: list[Task],
    domains: list[Domain],
    nudge_stats: dict,
    mit_task: Task | None,
    message: str,
    history: list[dict],
) -> list[dict]:
    """Build the message list for the AI API call."""
    context = assemble_chat_context(tasks, domains, nudge_stats, mit_task)

    messages = [
        {
            "role": "user",
            "content": f"[Current task data — use this to ground your responses]\n\n{context}",
        },
        {
            "role": "assistant",
            "content": "Got it. I have your current task data. What would you like to know?",
        },
    ]

    for msg in history:
        messages.append({"role": msg["role"], "content": msg["content"]})

    messages.append({"role": "user", "content": message})
    return messages


def generate_response(
    tasks: list[Task],
    domains: list[Domain],
    nudge_stats: dict,
    mit_task: Task | None,
    message: str,
    history: list[dict],
) -> str | None:
    """Generate a conversational AI response. Returns None on any failure."""
    client = get_anthropic_client()
    if client is None:
        return None

    messages = _build_messages(tasks, domains, nudge_stats, mit_task, message, history)

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=500,
            system=SYSTEM_PROMPT,
            messages=messages,
        )
        return response.content[0].text
    except Exception:
        logger.warning("Chat response generation failed", exc_info=True)
        return None


def generate_response_stream(
    tasks: list[Task],
    domains: list[Domain],
    nudge_stats: dict,
    mit_task: Task | None,
    message: str,
    history: list[dict],
):
    """Generate a streaming AI response. Returns None if client unavailable, else a generator."""
    client = get_anthropic_client()
    if client is None:
        return None

    messages = _build_messages(tasks, domains, nudge_stats, mit_task, message, history)

    def token_generator():
        with client.messages.stream(
            model="claude-haiku-4-5-20251001",
            max_tokens=500,
            system=SYSTEM_PROMPT,
            messages=messages,
        ) as stream:
            yield from stream.text_stream

    return token_generator()
