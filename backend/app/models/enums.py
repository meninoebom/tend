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
