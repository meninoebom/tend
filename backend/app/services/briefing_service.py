import json
import logging
from collections import Counter
from datetime import datetime, timezone

from app.models.task import Task
from app.schemas.triage_schemas import BriefingResponse

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are Tend's morning briefing assistant. Tend is a conscious todo app that values honesty over productivity guilt.

Your job: give a short, honest briefing before the user starts triaging their task queue. Be laconic — no cheerleading, no guilt trips, no productivity-bro energy. Just the facts with gentle calibration.

Respond with a JSON object containing exactly three fields:
- "summary": One sentence about queue composition (count, buckets, any frequently deferred tasks)
- "domain_balance": One sentence about life-domain distribution (which domains are heavy, which are empty)
- "calibration": One sentence comparing today's load to the user's actual completion average

Keep each field to 1-2 sentences max. Be honest and direct."""


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


def assemble_context(tasks: list[Task], nudge_stats: dict) -> str:
    """Build a text context block from tasks and stats for the AI prompt."""
    lines = []

    lines.append(f"Queue: {len(tasks)} tasks needing triage")

    # Bucket distribution
    bucket_counts = Counter()
    for t in tasks:
        bucket_counts[t.bucket] += 1
    if bucket_counts:
        bucket_parts = [f"{bucket}: {count}" for bucket, count in bucket_counts.items()]
        lines.append(f"By bucket: {', '.join(bucket_parts)}")

    # Domain distribution
    domain_counts = Counter()
    no_domain = 0
    for t in tasks:
        if t.domain is not None:
            domain_counts[t.domain.name] += 1
        else:
            no_domain += 1
    if domain_counts:
        domain_parts = [f"{name}: {count}" for name, count in domain_counts.most_common()]
        lines.append(f"By domain: {', '.join(domain_parts)}")
    if no_domain:
        lines.append(f"No domain assigned: {no_domain}")

    # Frequently deferred tasks
    deferred = [t for t in tasks if t.reschedule_count >= 2]
    if deferred:
        defer_lines = [f"- \"{t.text}\" (deferred {t.reschedule_count} times)" for t in deferred[:5]]
        lines.append("Frequently deferred:\n" + "\n".join(defer_lines))

    # Task details
    if tasks:
        task_lines = []
        for t in tasks:
            domain_str = f" [{t.domain.name}]" if t.domain else ""
            age = (datetime.now(timezone.utc).replace(tzinfo=None) - t.created_at).days if t.created_at else 0
            task_lines.append(f"- {t.text} ({t.bucket}{domain_str}, {age}d old, deferred {t.reschedule_count}x)")
        lines.append("Tasks:\n" + "\n".join(task_lines))

    # Nudge stats
    avg = nudge_stats.get("average_completed", 0)
    today_count = nudge_stats.get("today_count", 0)
    completed = nudge_stats.get("completed_count", 0)
    lines.append(f"Today's load: {today_count} tasks added, {completed} completed so far")
    lines.append(f"30-day completion average: {avg}")

    return "\n".join(lines)


def generate_briefing(tasks: list[Task], nudge_stats: dict) -> BriefingResponse:
    """Generate an AI briefing for the triage queue. Returns empty briefing on any failure."""
    client = get_anthropic_client()
    if client is None:
        return BriefingResponse()

    context = assemble_context(tasks, nudge_stats)

    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": context}],
        )
        raw = response.content[0].text
        data = json.loads(raw)
        return BriefingResponse(
            summary=data.get("summary", ""),
            domain_balance=data.get("domain_balance", ""),
            calibration=data.get("calibration", ""),
        )
    except Exception:
        logger.warning("Briefing generation failed, returning empty briefing", exc_info=True)
        return BriefingResponse()
