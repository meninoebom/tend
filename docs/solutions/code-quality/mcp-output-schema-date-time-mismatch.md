# MCP tools fail with "Structured content does not match the tool's output schema"

## Symptom

In Claude, every Tend tool that returns a task (`tend_add_task`, `tend_list_tasks`, `tend_complete_task`, ...) errors:

```
Structured content does not match the tool's output schema:
data/created_at must match format "date-time", data/updated_at must match format "date-time"
```

`tend_get_state` and `tend_list_domains` keep working, because they return no timestamps. Writes still land in the database; only the response is rejected, so retrying an add creates a duplicate.

## Root cause

Models stamp `created_at`/`updated_at`/`completed_at` with `datetime.utcnow()`, which is naive. Pydantic serializes a naive datetime without an offset (`2026-11-22T23:26:53.794816`). The MCP SDK publishes each tool's return type as an `outputSchema` with `"format": "date-time"`, which means RFC 3339 and requires an offset. Claude validates structured content against that schema and rejects it.

The same strings were also wrong in the web app: `new Date("2026-11-22T23:26:53")` parses as local time, not UTC.

## Fix

Response schemas declare server-stamped times as `UtcDatetime` (`app/schemas/utc.py`), which attaches UTC to naive values so they serialize with `+00:00`. `tests/test_mcp.py::test_task_timestamps_carry_a_utc_offset` guards it.

## Rule going forward

Any `datetime` in a response schema that the server stamps uses `UtcDatetime`, never bare `datetime`. `PlacementBrief.block_start` is still bare `datetime`: Plot sends it as a naive wall-clock time, so attaching UTC would shift it. If Plot ever writes a placement without an offset, `tend_list_tasks` will fail the same way for that task.
