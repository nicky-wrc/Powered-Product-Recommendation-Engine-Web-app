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
            "ALTER TABLE orders ADD COLUMN IF NOT EXISTS gift_wrap BOOLEAN DEFAULT false;",
            "ALTER TABLE orders ADD COLUMN IF NOT EXISTS gift_message VARCHAR(500);",
            "ALTER TABLE products ADD COLUMN IF NOT EXISTS video_url VARCHAR(2048);",
            "ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_price NUMERIC(12,2);",
            "ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_ends_at TIMESTAMPTZ;",
        ):
            conn.execute(text(stmt))

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS product_variants (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                    label VARCHAR(400) NOT NULL,
                    price NUMERIC(12, 2) NOT NULL,
                    stock INTEGER NOT NULL DEFAULT 0,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    options JSONB NULL
                );
                CREATE INDEX IF NOT EXISTS ix_product_variants_product_id ON product_variants(product_id);
                """
            ),
        )
        conn.execute(text("ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS variant_id UUID;"))
        conn.execute(
            text(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint WHERE conname = 'cart_items_variant_id_fkey'
                    ) THEN
                        ALTER TABLE cart_items
                            ADD CONSTRAINT cart_items_variant_id_fkey
                            FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE;
                    END IF;
                END $$;
                """
            ),
        )
        conn.execute(text("ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS uq_cart_user_product;"))
        conn.execute(
            text(
                """
                DROP INDEX IF EXISTS uq_cart_user_product_no_variant;
                CREATE UNIQUE INDEX IF NOT EXISTS uq_cart_user_product_no_variant
                    ON cart_items (user_id, product_id) WHERE variant_id IS NULL;
                DROP INDEX IF EXISTS uq_cart_user_product_with_variant;
                CREATE UNIQUE INDEX IF NOT EXISTS uq_cart_user_product_with_variant
                    ON cart_items (user_id, product_id, variant_id) WHERE variant_id IS NOT NULL;
                """
            ),
        )
        conn.execute(text("ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id UUID;"))
        conn.execute(text("ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_label VARCHAR(400);"))
        conn.execute(
            text(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint WHERE conname = 'order_items_variant_id_fkey'
                    ) THEN
                        ALTER TABLE order_items
                            ADD CONSTRAINT order_items_variant_id_fkey
                            FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL;
                    END IF;
                END $$;
                """
            ),
        )


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
