import hmac

from fastapi import APIRouter, Depends, Header
from sqlmodel import Session

from app.core.config import settings
from app.core.deps import get_db
from app.core.errors import AppError
from app.services import reaper_service

router = APIRouter(prefix="/reaper", tags=["reaper"])


def _verify_reaper_key(x_reaper_key: str | None = Header(default=None)) -> None:
    if x_reaper_key is None or not hmac.compare_digest(
        x_reaper_key.encode(), settings.reaper_api_key.encode()
    ):
        raise AppError(code="unauthorized", message="Invalid reaper key", status_code=401)


@router.post("/run")
def run_reaper(
    db: Session = Depends(get_db),
    _: None = Depends(_verify_reaper_key),
):
    count = reaper_service.run_reaper(db)
    return {"archived_count": count}
