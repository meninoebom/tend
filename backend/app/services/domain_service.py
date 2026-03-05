import uuid

from sqlalchemy import func
from sqlmodel import Session, select

from app.core.errors import DomainLimitReachedError, NotFoundError
from app.models.domain import Domain


FREE_DOMAIN_LIMIT = 5
PRO_DOMAIN_LIMIT = 20


def create_domain(
    db: Session,
    user_id: uuid.UUID,
    name: str,
    color: str,
    is_pro: bool = False,
) -> Domain:
    limit = PRO_DOMAIN_LIMIT if is_pro else FREE_DOMAIN_LIMIT
    count = db.exec(
        select(func.count()).select_from(Domain).where(Domain.user_id == user_id)
    ).one()
    if count >= limit:
        raise DomainLimitReachedError(limit=limit)

    # Auto-assign next position
    max_pos = db.exec(
        select(func.coalesce(func.max(Domain.position), -1)).where(Domain.user_id == user_id)
    ).one()

    domain = Domain(
        user_id=user_id,
        name=name.strip(),
        color=color,
        position=max_pos + 1,
    )
    db.add(domain)
    db.flush()
    db.refresh(domain)
    return domain


def get_domains(db: Session, user_id: uuid.UUID) -> list[Domain]:
    return list(
        db.exec(
            select(Domain).where(Domain.user_id == user_id).order_by(Domain.position)
        ).all()
    )


def get_domain(db: Session, user_id: uuid.UUID, domain_id: uuid.UUID) -> Domain:
    domain = db.exec(
        select(Domain).where(Domain.id == domain_id, Domain.user_id == user_id)
    ).first()
    if domain is None:
        raise NotFoundError("Domain not found")
    return domain


def update_domain(
    db: Session,
    user_id: uuid.UUID,
    domain_id: uuid.UUID,
    *,
    name: str | None = None,
    color: str | None = None,
    position: int | None = None,
) -> Domain:
    domain = get_domain(db, user_id, domain_id)

    if name is not None:
        domain.name = name.strip()
    if color is not None:
        domain.color = color
    if position is not None:
        domain.position = position

    db.add(domain)
    db.flush()
    db.refresh(domain)
    return domain


def delete_domain(db: Session, user_id: uuid.UUID, domain_id: uuid.UUID) -> None:
    domain = get_domain(db, user_id, domain_id)
    # ON DELETE SET NULL handles tasks at DB level
    db.delete(domain)
    db.flush()


def create_default_domains(db: Session, user_id: uuid.UUID) -> list[Domain]:
    """Create the 5 default domains for a new user."""
    defaults = [
        ("Work", "#3b82f6"),
        ("Personal", "#22c55e"),
        ("Health", "#ef4444"),
        ("Creative", "#f59e0b"),
        ("Admin", "#8b5cf6"),
    ]
    domains = []
    for i, (name, color) in enumerate(defaults):
        domain = Domain(user_id=user_id, name=name, color=color, position=i)
        db.add(domain)
        domains.append(domain)
    db.flush()
    for d in domains:
        db.refresh(d)
    return domains
