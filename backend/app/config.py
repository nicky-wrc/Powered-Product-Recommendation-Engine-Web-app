from decimal import Decimal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_version: str = "0.2.0"
    database_url: str = "postgresql+psycopg://recengine:recengine@localhost:5432/recengine"
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7
    # Comma-separated explicit origins. With cors_allow_lan_regex, loopback any port and [::1] also match.
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    # When true (default), allow dev Origins: localhost/127.0.0.1/[::1] (any port) + 192.168.* / 10.* LAN.
    cors_allow_lan_regex: bool = True
    # Optional: auto-create or promote admin on startup (local development — avoid real secrets in production).
    bootstrap_admin_email: str | None = None
    bootstrap_admin_password: str | None = None
    bootstrap_admin_name: str | None = None
    # Optional: redis://localhost:6379/0 — enables short TTL cache for /recommendations/popular and /me
    redis_url: str | None = None
    # Optional: Stripe Checkout (test keys ok for dev). Webhook optional if you use POST /payments/sync-session after redirect.
    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None
    # Storefront origin for Stripe success/cancel URLs (must match where users open the Next.js app).
    public_app_url: str = "http://localhost:3000"
    # Loyalty program: points earned per $1 of qualifying merchandise (after promo and point redemption, before gift wrap).
    loyalty_earn_points_per_dollar: Decimal = Decimal("1")
    # Points required for $1.00 off merchandise (e.g. 100 => 100 pts = $1).
    loyalty_redeem_points_per_dollar: int = 100


settings = Settings()
