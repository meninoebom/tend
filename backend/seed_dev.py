"""
Seed realistic dev data for UI testing.
Run from backend/: uv run python seed_dev.py
"""
import datetime
import uuid

from sqlalchemy import delete
from sqlmodel import Session, create_engine, select

from app.models.domain import Domain
from app.models.enums import BucketType, TaskStatus
from app.models.task import Task
from app.models.user import User

DATABASE_URL = "postgresql://brandon@localhost:5432/tend_dev"
USER_EMAIL = "afrobot@gmail.com"

engine = create_engine(DATABASE_URL)

DOMAINS = [
    ("Work", "#3b82f6"),
    ("Personal", "#10b981"),
    ("Health", "#ef4444"),
    ("Creative", "#f59e0b"),
    ("Admin", "#8b5cf6"),
]

# (text, bucket, important, urgent, days_old)
TASKS = [
    # Today — Work (important + urgent = DO FIRST)
    ("Gallup tech screen", "today", True, True, 1),
    ("Draft Q2 planning doc", "today", True, True, 1),
    # Today — Work (important only = SCHEDULE)
    ("Neon.ai", "today", True, False, 14),
    # Today — Work (background)
    ("Thinking on paper review", "today", False, False, 14),
    ("Taking notes video", "today", False, False, 14),
    ("SNARE stories at least 30 min", "today", False, False, 14),
    # Today — Personal (urgent = QUICK)
    ("Migrate old laptop", "today", False, True, 2),
    ("Call J Roise", "today", False, True, 1),
    ("Call Mestre Themba", "today", False, False, 0),
    # Today — Admin
    ("Install either NanoClaw or OpenClaw on server", "today", False, False, 1),
    # Soon — Work
    ("Rewrite onboarding copy", "soon", True, False, 3),
    ("Prepare board slides", "soon", False, False, 5),
    ("Review contractor invoices", "soon", False, False, 2),
    ("Update project roadmap", "soon", True, False, 7),
    ("Reply to Miriam", "soon", False, True, 1),
    # Soon — Personal
    ("Read Thinking in Systems", "later", True, False, 10),
    # Soon — Admin
    ("Expense receipts for March", "soon", False, True, 4),
    # Later — Work
    ("Redesign portfolio", "later", False, False, 20),
    # Later — Personal
    ("Learn to sail", "someday", False, False, 30),
    # Later — Creative
    ("Sketch app icon directions", "later", False, False, 15),
    ("Write about the year", "someday", False, False, 45),
    # Later — Health
    ("Dentist follow-up", "later", True, False, 8),
    # Later — Admin
    ("Research retirement rollover", "later", True, False, 12),
    # Someday
    ("Start a podcast", "someday", False, False, 60),
    ("Learn Portuguese", "someday", False, False, 90),
    ("Build cabin", "someday", False, False, 120),
    # Done tasks (a few)
    ("Weekly review", "today", False, False, 0),
    ("Send invoice to client", "today", False, False, 2),
]


def seed():
    with Session(engine) as db:
        user = db.exec(select(User).where(User.email == USER_EMAIL)).first()
        if not user:
            print(f"User {USER_EMAIL} not found. Sign up first.")
            return

        # Clear existing domains and tasks (bulk delete avoids lazy='raise' on relationships)
        db.exec(delete(Task).where(Task.user_id == user.id))
        db.exec(delete(Domain).where(Domain.user_id == user.id))
        db.flush()

        # Create domains
        domain_objs: dict[str, Domain] = {}
        for i, (name, color) in enumerate(DOMAINS):
            d = Domain(user_id=user.id, name=name, color=color, position=i)
            db.add(d)
            db.flush()
            domain_objs[name] = d

        domain_by_task = {
            "Gallup tech screen": "Work",
            "Draft Q2 planning doc": "Admin",
            "Neon.ai": "Work",
            "Thinking on paper review": "Work",
            "Taking notes video": "Work",
            "SNARE stories at least 30 min": "Work",
            "Migrate old laptop": "Personal",
            "Call J Roise": "Personal",
            "Call Mestre Themba": "Personal",
            "Install either NanoClaw or OpenClaw on server": "Admin",
            "Rewrite onboarding copy": "Work",
            "Prepare board slides": "Work",
            "Review contractor invoices": "Admin",
            "Update project roadmap": "Work",
            "Reply to Miriam": "Personal",
            "Read Thinking in Systems": "Personal",
            "Expense receipts for March": "Admin",
            "Redesign portfolio": "Creative",
            "Learn to sail": "Personal",
            "Sketch app icon directions": "Creative",
            "Write about the year": "Creative",
            "Dentist follow-up": "Health",
            "Research retirement rollover": "Admin",
            "Start a podcast": "Creative",
            "Learn Portuguese": "Personal",
            "Build cabin": "Personal",
            "Weekly review": "Work",
            "Send invoice to client": "Admin",
        }

        today = datetime.date.today()
        now = datetime.datetime.utcnow()

        for text, bucket, important, urgent, days_old in TASKS:
            domain_name = domain_by_task.get(text)
            domain = domain_objs.get(domain_name) if domain_name else None

            # Mark a couple as complete
            status = TaskStatus.pending
            if text in ("Weekly review", "Send invoice to client"):
                status = TaskStatus.complete

            created_at = now - datetime.timedelta(days=days_old)
            t = Task(
                user_id=user.id,
                domain_id=domain.id if domain else None,
                text=text,
                bucket=BucketType(bucket),
                status=status,
                important=important,
                urgent=urgent,
                triaged_at=today,
                created_at=created_at,
                updated_at=created_at,
            )
            db.add(t)

        db.commit()
        print(f"Seeded {len(TASKS)} tasks across {len(DOMAINS)} domains for {USER_EMAIL}")


if __name__ == "__main__":
    seed()
