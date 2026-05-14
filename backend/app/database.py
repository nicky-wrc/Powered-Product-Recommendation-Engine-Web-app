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
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS express_checkout_enabled BOOLEAN NOT NULL DEFAULT false;",
            "ALTER TABLE orders ADD COLUMN IF NOT EXISTS gift_wrap BOOLEAN DEFAULT false;",
            "ALTER TABLE orders ADD COLUMN IF NOT EXISTS gift_message VARCHAR(500);",
            "ALTER TABLE products ADD COLUMN IF NOT EXISTS video_url VARCHAR(2048);",
            "ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_price NUMERIC(12,2);",
            "ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_ends_at TIMESTAMPTZ;",
            "ALTER TABLE products ADD COLUMN IF NOT EXISTS is_gift_card BOOLEAN NOT NULL DEFAULT false;",
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
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS promo_codes (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    code VARCHAR(64) NOT NULL UNIQUE,
                    kind VARCHAR(16) NOT NULL,
                    value NUMERIC(12, 2) NOT NULL,
                    min_subtotal NUMERIC(14, 2) NULL,
                    max_uses INTEGER NULL,
                    uses_count INTEGER NOT NULL DEFAULT 0,
                    active BOOLEAN NOT NULL DEFAULT true,
                    valid_from TIMESTAMPTZ NULL,
                    valid_until TIMESTAMPTZ NULL
                );
                CREATE INDEX IF NOT EXISTS ix_promo_codes_code ON promo_codes (code);
                """
            ),
        )
        conn.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_code VARCHAR(64);"))
        conn.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_discount NUMERIC(14,2);"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS loyalty_points INTEGER NOT NULL DEFAULT 0;"))
        conn.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS loyalty_points_redeemed INTEGER;"))
        conn.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS loyalty_discount NUMERIC(14,2);"))
        conn.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS loyalty_points_earned INTEGER;"))
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS gift_cards (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    code VARCHAR(32) NOT NULL UNIQUE,
                    face_value NUMERIC(12, 2) NOT NULL,
                    balance_remaining NUMERIC(12, 2) NOT NULL,
                    issuer_order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                    purchased_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    recipient_email VARCHAR(255) NULL,
                    personal_message TEXT NULL,
                    active BOOLEAN NOT NULL DEFAULT true,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                );
                CREATE INDEX IF NOT EXISTS ix_gift_cards_issuer_order_id ON gift_cards (issuer_order_id);
                CREATE INDEX IF NOT EXISTS ix_gift_cards_purchased_by_user_id ON gift_cards (purchased_by_user_id);
                """
            ),
        )
        conn.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS gift_card_code VARCHAR(32);"))
        conn.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS gift_card_discount NUMERIC(14,2);"))
        conn.execute(text("ALTER TABLE products ADD COLUMN IF NOT EXISTS product_code VARCHAR(40);"))
        conn.execute(text("ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_title VARCHAR(300);"))
        conn.execute(text("ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_description VARCHAR(500);"))
        conn.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS ix_products_product_code
                ON products (product_code)
                WHERE product_code IS NOT NULL AND BTRIM(product_code) <> '';
                """
            ),
        )
        conn.execute(
            text(
                """
                UPDATE products
                SET product_code = 'REC-' || REPLACE(id::text, '-', '')
                WHERE product_code IS NULL OR BTRIM(product_code) = '';
                """
            ),
        )
        conn.execute(
            text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmation_email_sent_at TIMESTAMPTZ;"),
        )
        conn.execute(text("ALTER TABLE products ADD COLUMN IF NOT EXISTS brand VARCHAR(120);"))
        conn.execute(text("ALTER TABLE products ADD COLUMN IF NOT EXISTS is_hazardous BOOLEAN NOT NULL DEFAULT false;"))
        conn.execute(text("ALTER TABLE products ADD COLUMN IF NOT EXISTS minimum_age SMALLINT NULL;"))
        conn.execute(text("ALTER TABLE products ADD COLUMN IF NOT EXISTS compliance_note TEXT NULL;"))
        conn.execute(text("ALTER TABLE products ADD COLUMN IF NOT EXISTS volume_tiers JSONB NULL;"))
        conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_products_brand_norm
                ON products (LOWER(TRIM(brand)))
                WHERE brand IS NOT NULL AND BTRIM(brand) <> '';
                """
            ),
        )
        conn.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_carrier VARCHAR(100);"))
        conn.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(120);"))
        conn.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;"))
        conn.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;"))
        conn.execute(
            text(
                """
                DO $$
                BEGIN
                    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_schema = current_schema() AND table_name = 'products' AND column_name = 'a_plus_modules'
                        ) THEN
                            ALTER TABLE products ADD COLUMN a_plus_modules JSONB;
                        END IF;
                    END IF;
                END $$;
                """
            ),
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS product_price_snapshots (
                    id SERIAL PRIMARY KEY,
                    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                    day DATE NOT NULL,
                    unit_price NUMERIC(12, 2) NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    CONSTRAINT uq_product_price_snapshots_product_day UNIQUE (product_id, day)
                );
                CREATE INDEX IF NOT EXISTS ix_product_price_snapshots_product_id ON product_price_snapshots(product_id);
                CREATE INDEX IF NOT EXISTS ix_product_price_snapshots_day ON product_price_snapshots(day);
                """
            ),
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS product_bundles (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    name VARCHAR(200) NOT NULL,
                    slug VARCHAR(160),
                    description TEXT,
                    bundle_price NUMERIC(12, 2) NOT NULL,
                    active BOOLEAN NOT NULL DEFAULT true,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    CONSTRAINT uq_product_bundles_slug UNIQUE (slug)
                );
                CREATE INDEX IF NOT EXISTS ix_product_bundles_active_sort ON product_bundles (active, sort_order);
                CREATE TABLE IF NOT EXISTS product_bundle_items (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    bundle_id UUID NOT NULL REFERENCES product_bundles(id) ON DELETE CASCADE,
                    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                    variant_id UUID REFERENCES product_variants(id) ON DELETE CASCADE,
                    quantity INTEGER NOT NULL DEFAULT 1,
                    sort_order INTEGER NOT NULL DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS ix_product_bundle_items_bundle_id ON product_bundle_items(bundle_id);
                """
            ),
        )
        conn.execute(text("ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS bundle_id UUID;"))
        conn.execute(text("ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS bundle_group_id UUID;"))
        conn.execute(
            text(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cart_items_bundle_id_fkey') THEN
                        ALTER TABLE cart_items
                            ADD CONSTRAINT cart_items_bundle_id_fkey
                            FOREIGN KEY (bundle_id) REFERENCES product_bundles(id) ON DELETE SET NULL;
                    END IF;
                END $$;
                """
            ),
        )
        conn.execute(text("DROP INDEX IF EXISTS uq_cart_user_product_no_variant;"))
        conn.execute(text("DROP INDEX IF EXISTS uq_cart_user_product_with_variant;"))
        conn.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_cart_plain_no_variant
                    ON cart_items (user_id, product_id)
                    WHERE variant_id IS NULL AND bundle_group_id IS NULL;
                CREATE UNIQUE INDEX IF NOT EXISTS uq_cart_plain_with_variant
                    ON cart_items (user_id, product_id, variant_id)
                    WHERE variant_id IS NOT NULL AND bundle_group_id IS NULL;
                CREATE UNIQUE INDEX IF NOT EXISTS uq_cart_bundle_no_variant
                    ON cart_items (user_id, product_id, bundle_group_id)
                    WHERE variant_id IS NULL AND bundle_group_id IS NOT NULL;
                CREATE UNIQUE INDEX IF NOT EXISTS uq_cart_bundle_with_variant
                    ON cart_items (user_id, product_id, variant_id, bundle_group_id)
                    WHERE variant_id IS NOT NULL AND bundle_group_id IS NOT NULL;
                """
            ),
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS price_match_reports (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                    reporter_email VARCHAR(255) NULL,
                    competitor_url VARCHAR(2048) NULL,
                    reported_price NUMERIC(12, 2) NOT NULL,
                    currency VARCHAR(8) NOT NULL DEFAULT 'USD',
                    notes TEXT NULL,
                    storefront_unit_at_submit NUMERIC(12, 2) NULL,
                    status VARCHAR(20) NOT NULL DEFAULT 'pending',
                    admin_note TEXT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                );
                CREATE INDEX IF NOT EXISTS ix_price_match_reports_product_id ON price_match_reports (product_id);
                CREATE INDEX IF NOT EXISTS ix_price_match_reports_status ON price_match_reports (status);
                CREATE INDEX IF NOT EXISTS ix_price_match_reports_created_at ON price_match_reports (created_at DESC);
                """
            ),
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS gift_registries (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    title VARCHAR(200) NOT NULL,
                    slug VARCHAR(160) NOT NULL,
                    description TEXT NULL,
                    event_date DATE NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    CONSTRAINT uq_gift_registries_slug UNIQUE (slug)
                );
                CREATE INDEX IF NOT EXISTS ix_gift_registries_user_id ON gift_registries (user_id);
                CREATE INDEX IF NOT EXISTS ix_gift_registries_slug_lookup ON gift_registries (slug);
                CREATE TABLE IF NOT EXISTS gift_registry_items (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    registry_id UUID NOT NULL REFERENCES gift_registries(id) ON DELETE CASCADE,
                    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                    variant_id UUID NULL REFERENCES product_variants(id) ON DELETE CASCADE,
                    quantity_requested INTEGER NOT NULL DEFAULT 1,
                    note VARCHAR(500) NULL,
                    sort_order INTEGER NOT NULL DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS ix_gift_registry_items_registry_id ON gift_registry_items (registry_id);
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
