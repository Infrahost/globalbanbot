from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class BanSummary(BaseModel):
    success: int = 0
    failed: int = 0
    skipped: int = 0


class BanActionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, use_enum_values=True)

    id: str
    global_ban_id: str
    guild_id: str
    status: str
    error: str | None
    created_at: datetime


class GlobalBanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    banned_by: str
    reason: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class GlobalBanDetail(GlobalBanOut):
    actions: list[BanActionOut] = Field(default_factory=list)


class CreateBanBody(BaseModel):
    user_id: str = Field(min_length=1, alias="userId")
    reason: str = Field(min_length=1, max_length=512)

    model_config = ConfigDict(populate_by_name=True)


class GuildOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    owner_id: str
    is_connected_to_network: bool
    log_channel_id: str | None
    mod_can_execute_ban: bool
    created_at: datetime
    updated_at: datetime


class StatsOut(BaseModel):
    guild_count: int
    connected_guild_count: int
    active_ban_count: int
    total_ban_records: int
