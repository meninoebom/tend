import datetime as dt

from pydantic import BaseModel


class NudgeResponse(BaseModel):
    today_count: int
    completed_count: int
    average_completed: float
    message: str


class DailyStatResponse(BaseModel):
    date: dt.date
    tasks_added: int
    tasks_completed: int
