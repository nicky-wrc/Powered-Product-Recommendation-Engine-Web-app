from datetime import datetime, timedelta, timezone

import bcrypt
from jose import jwt

from app.config import settings


def _bcrypt_bytes(password: str) -> bytes:
    """bcrypt ignores bytes past 72; align hash and verify on the same prefix."""
    return password.encode("utf-8")[:72]


def hash_password(password: str) -> str:
    dig = bcrypt.hashpw(_bcrypt_bytes(password), bcrypt.gensalt())
    return dig.decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_bcrypt_bytes(plain), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode(
        {"sub": subject, "exp": expire},
        settings.secret_key,
        algorithm=settings.algorithm,
    )
