"""Optional dev/local admin user from environment (see BOOTSTRAP_ADMIN_* in .env)."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.core.security import hash_password
from app.models.user import User


def ensure_bootstrap_admin(db: Session) -> None:
    """
    If BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are set, create or update that user
    as is_admin=True. Intended for local/demo; do not use real passwords in production .env.
    """
    email_raw = (settings.bootstrap_admin_email or "").strip().lower()
    password = settings.bootstrap_admin_password
    if not email_raw or not password:
        return

    name = (settings.bootstrap_admin_name or "Admin").strip() or "Admin"
    user = db.scalar(select(User).where(User.email == email_raw))
    if user is None:
        db.add(
            User(
                email=email_raw,
                name=name,
                hashed_password=hash_password(password),
                is_admin=True,
            ),
        )
    else:
        user.is_admin = True
        user.name = name
        user.hashed_password = hash_password(password)
    db.commit()
