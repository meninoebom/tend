"""Railway startup: validate config, run migrations, start server."""

import os
import subprocess
import sys


def main():
    db_url = os.environ.get("DATABASE_URL", "")

    # Diagnose
    if not db_url:
        print("FATAL: DATABASE_URL is not set")
        sys.exit(1)

    scheme = db_url.split("://")[0] if "://" in db_url else "NO_SCHEME"
    print(f"DATABASE_URL scheme: {scheme}, length: {len(db_url)}")

    # Validate secrets
    jwt_secret = os.environ.get("INTERNAL_JWT_SECRET", "")
    if not jwt_secret or len(jwt_secret) < 32:
        print("FATAL: INTERNAL_JWT_SECRET must be set and at least 32 characters")
        sys.exit(1)

    # Warn if password reset email is silently disabled
    if not os.environ.get("RESEND_API_KEY"):
        print("WARNING: RESEND_API_KEY not set — password reset emails will be silently skipped")

    # Run migrations
    print("Running alembic upgrade head...")
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        check=False,
    )
    if result.returncode != 0:
        print(f"Alembic migration failed (exit {result.returncode})")
        sys.exit(1)

    # Start server
    port = os.environ.get("PORT", "8000")
    print(f"Starting uvicorn on port {port}...")
    os.execvp(
        sys.executable,
        [
            sys.executable, "-m", "uvicorn",
            "app.main:app",
            "--host", "0.0.0.0",
            "--port", port,
            "--proxy-headers",
            "--forwarded-allow-ips", "*",
        ],
    )


if __name__ == "__main__":
    main()
