from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+psycopg://recengine:recengine@localhost:5432/recengine"
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7
    # Comma-separated explicit origins. With cors_allow_lan_regex, loopback any port and [::1] also match.
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    # When true (default), allow dev Origins: localhost/127.0.0.1/[::1] (any port) + 192.168.* / 10.* LAN.
    cors_allow_lan_regex: bool = True


settings = Settings()
