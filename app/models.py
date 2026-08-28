from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def new_id() -> str:
    return str(uuid.uuid4())


class StaffRole(str, enum.Enum):
    ADMIN = "ADMIN"
    MOD = "MOD"


class BanActionStatus(str, enum.Enum):
    PENDING = "PENDING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"


class Guild(Base):
    __tablename__ = "guilds"
    __table_args__ = (Index("ix_guilds_connected", "is_connected_to_network"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    owner_id: Mapped[str] = mapped_column(String, nullable=False)
    is_connected_to_network: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    log_channel_id: Mapped[str | None] = mapped_column(String, nullable=True)
    mod_can_execute_ban: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    staff: Mapped[list[Staff]] = relationship(back_populates="guild", cascade="all, delete-orphan")
    ban_actions: Mapped[list[BanAction]] = relationship(back_populates="guild", cascade="all, delete-orphan")


class GlobalBan(Base):
    __tablename__ = "global_bans"
    __table_args__ = (Index("ix_global_bans_active", "is_active"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    banned_by: Mapped[str] = mapped_column(String, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    actions: Mapped[list[BanAction]] = relationship(back_populates="global_ban", cascade="all, delete-orphan")


class Staff(Base):
    __tablename__ = "staff"
    __table_args__ = (UniqueConstraint("user_id", "guild_id", name="uq_staff_user_guild"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(String, nullable=False)
    guild_id: Mapped[str] = mapped_column(String, ForeignKey("guilds.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[StaffRole] = mapped_column(Enum(StaffRole, name="staffrole"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    guild: Mapped[Guild] = relationship(back_populates="staff")


class BanAction(Base):
    __tablename__ = "ban_actions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    global_ban_id: Mapped[str] = mapped_column(
        String, ForeignKey("global_bans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    guild_id: Mapped[str] = mapped_column(
        String, ForeignKey("guilds.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[BanActionStatus] = mapped_column(
        Enum(BanActionStatus, name="banactionstatus"), nullable=False, index=True
    )
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    global_ban: Mapped[GlobalBan] = relationship(back_populates="actions")
    guild: Mapped[Guild] = relationship(back_populates="ban_actions")
