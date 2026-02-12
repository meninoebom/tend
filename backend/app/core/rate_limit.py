import os

from slowapi import Limiter
from slowapi.util import get_remote_address

# In-memory rate limiter. Resets on deploy — acceptable for single instance.
# Auth endpoints (signup/login) are called server-to-server from Next.js,
# so get_remote_address sees the Next.js IP. This means the rate limit is
# effectively global for all users. That's fine: it caps total auth throughput
# (e.g., 10 logins/min across all users) which still blocks brute force.
# For per-user rate limiting, the Next.js layer would need its own limiter.
_enabled = os.environ.get("RATE_LIMIT_ENABLED", "true").lower() != "false"

limiter = Limiter(
    key_func=get_remote_address,
    enabled=_enabled,
)
