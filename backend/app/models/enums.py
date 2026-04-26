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
