from enum import StrEnum


class BucketType(StrEnum):
    today = "today"
    soon = "soon"
    later = "later"
    someday = "someday"


class TaskStatus(StrEnum):
    pending = "pending"
    complete = "complete"
    archived = "archived"


class AuthProvider(StrEnum):
    email = "email"
    google = "google"


class SubscriptionStatus(StrEnum):
    free = "free"
    active = "active"
    past_due = "past_due"
    canceled = "canceled"


class LayoutType(StrEnum):
    list = "list"
    grouped = "grouped"
    quadrant = "quadrant"
    matrix = "matrix"


class SizeType(StrEnum):
    """Coarse task size, set as a triage-time judgment (not a schedule).

    S = under 30 min, M = about an hour, L = half a day. Consumed by Plot to
    reason about block capacity; always optional in Tend.
    """

    small = "s"
    medium = "m"
    large = "l"
