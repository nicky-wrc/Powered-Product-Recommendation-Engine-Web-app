from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password, verify_password
from app.database import get_db
from app.deps import get_current_user
from app.image_upload import read_image_upload
from app.models.user import User
from app.schemas.auth import PasswordChange, ProfileUpdate, TokenResponse, UserCreate, UserLogin, UserPublic
from app.upload_paths import PROFILE_IMAGES_DIR, REVIEW_IMAGES_DIR

router = APIRouter(prefix="/auth", tags=["auth"])


def _public(u: User) -> UserPublic:
    return UserPublic(
        id=u.id,
        email=u.email,
        name=u.name,
        is_admin=u.is_admin,
        loyalty_points=int(u.loyalty_points or 0),
        avatar_url=u.avatar_url,
        phone=u.phone,
        address_line1=u.address_line1,
        address_line2=u.address_line2,
        city=u.city,
        province=u.province,
        postal_code=u.postal_code,
        country=u.country,
    )


@router.post("/register", response_model=TokenResponse)
def register(body: UserCreate, db: Session = Depends(get_db)) -> TokenResponse:
    email = body.email.lower().strip()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email already registered")
    user = User(
        email=email,
        name=body.name.strip(),
        hashed_password=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token, user=_public(user))


@router.post("/login", response_model=TokenResponse)
def login(body: UserLogin, db: Session = Depends(get_db)) -> TokenResponse:
    email = body.email.lower().strip()
    user = db.scalar(select(User).where(User.email == email))
    if user is None or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    token = create_access_token(str(user.id))
    return TokenResponse(access_token=token, user=_public(user))


@router.get("/me", response_model=UserPublic)
def me(user: User = Depends(get_current_user)) -> UserPublic:
    return _public(user)


@router.patch("/me", response_model=UserPublic)
@router.put("/me", response_model=UserPublic)
def update_profile(
    body: ProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserPublic:
    data = body.model_dump(exclude_unset=True)
    if data.get("name") is None:
        data.pop("name", None)
    new_email = data.pop("email", None)
    if new_email is not None:
        if new_email != user.email:
            other = db.scalar(select(User).where(User.email == new_email))
            if other is not None and other.id != user.id:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email already in use")
            user.email = new_email
    for key, value in data.items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return _public(user)


@router.post("/me/password", response_model=UserPublic)
def change_password(
    body: PasswordChange,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserPublic:
    if not verify_password(body.current_password, user.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    user.hashed_password = hash_password(body.new_password)
    db.commit()
    db.refresh(user)
    return _public(user)


def _remove_profile_files(user_id) -> None:
    PROFILE_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    uid_hex = str(user_id).replace("-", "")
    for p in PROFILE_IMAGES_DIR.glob(f"{uid_hex}.*"):
        try:
            p.unlink(missing_ok=True)
        except OSError:
            pass


@router.post("/me/avatar", response_model=UserPublic)
async def upload_avatar(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserPublic:
    data, ext = await read_image_upload(file)
    PROFILE_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    _remove_profile_files(user.id)
    name = f"{str(user.id).replace('-', '')}{ext}"
    dest = PROFILE_IMAGES_DIR / name
    dest.write_bytes(data)
    user.avatar_url = f"/uploads/profiles/{name}"
    db.commit()
    db.refresh(user)
    return _public(user)


@router.delete("/me/avatar", response_model=UserPublic)
def remove_avatar(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserPublic:
    _remove_profile_files(user.id)
    user.avatar_url = None
    db.commit()
    db.refresh(user)
    return _public(user)


@router.post("/me/upload/review-image")
async def upload_review_image(
    file: UploadFile = File(...),
    _user: User = Depends(get_current_user),
) -> dict[str, str]:
    """Store an image for use in product reviews (returns `/uploads/review-images/...` URL)."""
    data, ext = await read_image_upload(file)
    REVIEW_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    name = f"{uuid4().hex}{ext}"
    dest = REVIEW_IMAGES_DIR / name
    dest.write_bytes(data)
    return {"url": f"/uploads/review-images/{name}"}
