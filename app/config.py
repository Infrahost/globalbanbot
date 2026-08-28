from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    discord_token: str = Field(alias="DISCORD_TOKEN")
    client_id: str = Field(alias="CLIENT_ID")
    bot_owner_id: str = Field(alias="BOT_OWNER_ID")
    database_url: str = Field(alias="DATABASE_URL")
    api_port: int = Field(default=3000, alias="API_PORT")
    api_prefix: str = Field(default="/api/v1", alias="API_PREFIX")
    api_key: str = Field(min_length=8, alias="API_KEY")
    ban_concurrency: int = Field(default=5, alias="BAN_CONCURRENCY")

    @field_validator("ban_concurrency")
    @classmethod
    def clamp_concurrency(cls, value: int) -> int:
        if value < 1 or value > 25:
            raise ValueError("BAN_CONCURRENCY muss zwischen 1 und 25 liegen.")
        return value

    @property
    def async_database_url(self) -> str:
        url = self.database_url
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+asyncpg://", 1)
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+asyncpg://", 1)
        return url


settings = Settings()
