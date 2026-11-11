import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text

from app.api import account, api_tokens, billing, domains, state, tasks, triage
from app.core.config import settings
from app.core.deps import engine
from app.core.errors import AppError, app_error_handler
from app.core.rate_limit import limiter
from app.mcp_server import endpoint as mcp_endpoint
from app.mcp_server import redact_tokens

logger = logging.getLogger(__name__)


class RedactAccessTokens(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.args, tuple):
            record.args = tuple(
                redact_tokens(arg) if isinstance(arg, str) else arg for arg in record.args
            )
        return True


logging.getLogger("uvicorn.access").addFilter(RedactAccessTokens())


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None]:
    async with mcp_endpoint.running():
        yield


# Hide the interactive docs + OpenAPI schema in production. The backend is now
# reachable from the internet (a desktop client calls it directly), and there is
# no reason to advertise the full API surface publicly. Data routes are already
# JWT-gated; this just closes the schema/docs endpoints.
app = FastAPI(
    title="Tend",
    version="0.2.0",
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    openapi_url=None if settings.is_production else "/openapi.json",
    lifespan=lifespan,
)
app.state.limiter = limiter

# Routers
app.include_router(tasks.router)
app.include_router(triage.router)
app.include_router(domains.router)
app.include_router(account.router)
app.include_router(billing.router)
app.include_router(state.router)
app.include_router(api_tokens.router)
app.mount("/mcp", mcp_endpoint)

# Error handlers
app.add_exception_handler(AppError, app_error_handler)


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(_request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"code": "rate_limited", "message": "Too many requests. Please try again later."},
    )


# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins.split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/health")
def health_check():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "healthy"}
    except Exception:
        logger.exception("Health check failed: database unreachable")
        return {"status": "degraded"}
