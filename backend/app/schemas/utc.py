from datetime import UTC, datetime
from typing import Annotated

from pydantic import AfterValidator


def _assume_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


# Server-stamped columns hold naive UTC (datetime.utcnow). Without an offset,
# MCP clients reject them as RFC 3339 "date-time" and browsers parse them as local time.
UtcDatetime = Annotated[datetime, AfterValidator(_assume_utc)]
