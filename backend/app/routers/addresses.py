from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.models.user_address import UserAddress
from app.schemas.addresses import UserAddressCreate, UserAddressPublic, UserAddressUpdate

router = APIRouter(prefix="/addresses", tags=["addresses"])


def _to_public(row: UserAddress) -> UserAddressPublic:
    return UserAddressPublic.model_validate(row)


def _unset_defaults(db: Session, user_id: UUID) -> None:
    db.execute(update(UserAddress).where(UserAddress.user_id == user_id).values(is_default=False))


def _ensure_one_default(db: Session, user_id: UUID) -> None:
    has_def = db.scalar(
        select(func.count()).select_from(UserAddress).where(
            UserAddress.user_id == user_id,
            UserAddress.is_default.is_(True),
        ),
    )
    if (has_def or 0) > 0:
        return
    first = db.scalar(
        select(UserAddress)
        .where(UserAddress.user_id == user_id)
        .order_by(UserAddress.created_at.asc())
        .limit(1),
    )
    if first is not None:
        first.is_default = True


@router.get("", response_model=list[UserAddressPublic])
def list_addresses(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[UserAddressPublic]:
    rows = list(
        db.scalars(
            select(UserAddress)
            .where(UserAddress.user_id == user.id)
            .order_by(UserAddress.is_default.desc(), UserAddress.created_at.asc()),
        ).all(),
    )
    return [_to_public(r) for r in rows]


@router.post("", response_model=UserAddressPublic, status_code=status.HTTP_201_CREATED)
def create_address(
    body: UserAddressCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserAddressPublic:
    n_raw = db.scalar(select(func.count()).select_from(UserAddress).where(UserAddress.user_id == user.id))
    n = int(n_raw) if n_raw is not None else 0
    make_default = bool(body.is_default or n == 0)

    if make_default:
        _unset_defaults(db, user.id)

    row = UserAddress(
        user_id=user.id,
        label=body.label,
        recipient_name=body.recipient_name,
        phone=body.phone,
        address_line1=body.address_line1,
        address_line2=body.address_line2,
        city=body.city,
        province=body.province,
        postal_code=body.postal_code,
        country=body.country,
        is_default=make_default,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_public(row)


@router.get("/{address_id}", response_model=UserAddressPublic)
def get_address(
    address_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserAddressPublic:
    row = db.scalar(select(UserAddress).where(UserAddress.id == address_id, UserAddress.user_id == user.id))
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Address not found")
    return _to_public(row)


@router.patch("/{address_id}", response_model=UserAddressPublic)
def update_address(
    address_id: UUID,
    body: UserAddressUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserAddressPublic:
    row = db.scalar(select(UserAddress).where(UserAddress.id == address_id, UserAddress.user_id == user.id))
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Address not found")

    data = body.model_dump(exclude_unset=True)
    if "is_default" in body.model_fields_set:
        want_def = bool(body.is_default)
        data.pop("is_default", None)
        if want_def:
            _unset_defaults(db, user.id)
            row.is_default = True
        else:
            row.is_default = False

    for key, value in data.items():
        setattr(row, key, value)

    db.commit()
    db.refresh(row)
    _ensure_one_default(db, user.id)
    db.commit()
    db.refresh(row)
    return _to_public(row)


@router.post("/{address_id}/default", response_model=UserAddressPublic)
def set_default_address(
    address_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserAddressPublic:
    row = db.scalar(select(UserAddress).where(UserAddress.id == address_id, UserAddress.user_id == user.id))
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Address not found")
    _unset_defaults(db, user.id)
    row.is_default = True
    db.commit()
    db.refresh(row)
    return _to_public(row)


@router.delete("/{address_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_address(
    address_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    row = db.scalar(select(UserAddress).where(UserAddress.id == address_id, UserAddress.user_id == user.id))
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Address not found")
    was_default = row.is_default
    db.delete(row)
    db.commit()

    if was_default:
        first = db.scalar(
            select(UserAddress)
            .where(UserAddress.user_id == user.id)
            .order_by(UserAddress.created_at.asc())
            .limit(1),
        )
        if first is not None:
            first.is_default = True
            db.commit()
