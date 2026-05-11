from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def apply_runtime_schema_patches() -> None:
    """Lightweight migrations for dev DBs without Alembic revision history."""
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                ALTER TABLE orders
                ADD COLUMN IF NOT EXISTS stripe_checkout_session_id VARCHAR(255);
                """
            ),
        )
        conn.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS ix_orders_stripe_checkout_session_id
                ON orders (stripe_checkout_session_id)
                WHERE stripe_checkout_session_id IS NOT NULL;
                """
            ),
        )
        for stmt in (
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(512);",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(64);",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(255);",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(255);",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS city VARCHAR(128);",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS province VARCHAR(128);",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS postal_code VARCHAR(32);",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS country VARCHAR(128);",
        ):
            conn.execute(text(stmt))


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
