from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api import account, domains, reaper, stats, tasks, triage
from app.core.config import settings
from app.core.deps import engine
from app.core.errors import AppError, app_error_handler

app = FastAPI(title="Tend", version="0.1.0")

# Routers
app.include_router(tasks.router)
app.include_router(triage.router)
app.include_router(domains.router)
app.include_router(stats.router)
app.include_router(reaper.router)
app.include_router(account.router)

# Error handlers
app.add_exception_handler(AppError, app_error_handler)

# CORS — must be outermost middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "healthy", "database": "connected"}
    except Exception:
        return {"status": "unhealthy", "database": "disconnected"}
