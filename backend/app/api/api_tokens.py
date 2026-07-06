import uuid

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.core.deps import get_db
from app.core.security import get_current_user_id
from app.schemas.api_token_schemas import (
    ApiTokenCreate,
    ApiTokenCreated,
    ApiTokenResponse,
)
from app.services import api_token_service

router = APIRouter(prefix="/api-tokens", tags=["api-tokens"])


def _to_response(token) -> ApiTokenResponse:
    return ApiTokenResponse(
        id=token.id,
        name=token.name,
        created_at=token.created_at,
        last_used_at=token.last_used_at,
    )


@router.get("", response_model=list[ApiTokenResponse])
def list_api_tokens(
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    return [_to_response(t) for t in api_token_service.list_tokens(db, user_id)]


@router.post("", response_model=ApiTokenCreated, status_code=201)
def create_api_token(
    body: ApiTokenCreate,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    token, raw = api_token_service.create_token(db, user_id, body.name)
    return ApiTokenCreated(
        id=token.id,
        name=token.name,
        created_at=token.created_at,
        last_used_at=token.last_used_at,
        token=raw,
    )


@router.delete("/{token_id}", status_code=204)
def revoke_api_token(
    token_id: uuid.UUID,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    api_token_service.revoke_token(db, user_id, token_id)
