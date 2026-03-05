import uuid

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.core.deps import get_db
from app.core.security import get_current_user_id
from app.models.user import User
from app.schemas.domain_schemas import DomainCreate, DomainResponse, DomainUpdate
from app.services import domain_service

router = APIRouter(prefix="/domains", tags=["domains"])


def _to_response(domain) -> DomainResponse:
    return DomainResponse(
        id=domain.id,
        name=domain.name,
        color=domain.color,
        position=domain.position,
    )


@router.get("", response_model=list[DomainResponse])
def list_domains(
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    domains = domain_service.get_domains(db, user_id)
    return [_to_response(d) for d in domains]


@router.post("", response_model=DomainResponse, status_code=201)
def create_domain(
    body: DomainCreate,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    user = db.exec(select(User).where(User.id == user_id)).one()
    is_pro = user.subscription_status in ("active", "past_due")
    domain = domain_service.create_domain(db, user_id, name=body.name, color=body.color, is_pro=is_pro)
    return _to_response(domain)


@router.patch("/{domain_id}", response_model=DomainResponse)
def update_domain(
    domain_id: uuid.UUID,
    body: DomainUpdate,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    domain = domain_service.update_domain(
        db,
        user_id,
        domain_id,
        name=body.name,
        color=body.color,
        position=body.position,
    )
    return _to_response(domain)


@router.delete("/{domain_id}", status_code=204)
def delete_domain(
    domain_id: uuid.UUID,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
):
    domain_service.delete_domain(db, user_id, domain_id)
