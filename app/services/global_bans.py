from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable, Sequence
from typing import TypeVar

import discord
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import SessionLocal
from app.models import BanAction, BanActionStatus, GlobalBan, Guild
from app.schemas import BanSummary
from app.services.guilds import bot_can_ban
from app.services.logs import send_guild_log

logger = logging.getLogger(__name__)

T = TypeVar("T")
R = TypeVar("R")


async def _map_with_concurrency(
    items: Sequence[T], limit: int, mapper: Callable[[T], Awaitable[R]]
) -> list[R]:
    if not items:
        return []
    semaphore = asyncio.Semaphore(max(1, min(limit, len(items))))
    results: list[R | None] = [None] * len(items)

    async def run(index: int, item: T) -> None:
        async with semaphore:
            results[index] = await mapper(item)

    await asyncio.gather(*(run(i, item) for i, item in enumerate(items)))
    return [item for item in results if item is not None]  # type: ignore[misc]


def _summarize(statuses: Sequence[BanActionStatus]) -> BanSummary:
    summary = BanSummary()
    for status in statuses:
        if status == BanActionStatus.SUCCESS:
            summary.success += 1
        elif status == BanActionStatus.FAILED:
            summary.failed += 1
        else:
            summary.skipped += 1
    return summary


async def _record_action(
    global_ban_id: str,
    guild_id: str,
    status: BanActionStatus,
    error: str | None = None,
) -> BanActionStatus:
    async with SessionLocal() as session:
        session.add(BanAction(global_ban_id=global_ban_id, guild_id=guild_id, status=status, error=error))
        await session.commit()
    return status


def _resolve_guild(client: discord.Client, guild_id: str) -> discord.Guild | None:
    return client.get_guild(int(guild_id))


async def execute_global_ban(
    session: AsyncSession,
    client: discord.Client,
    *,
    user_id: str,
    reason: str,
    banned_by: str,
) -> tuple[GlobalBan, BanSummary]:
    result = await session.execute(select(GlobalBan).where(GlobalBan.user_id == user_id))
    ban = result.scalar_one_or_none()
    if ban is None:
        ban = GlobalBan(user_id=user_id, banned_by=banned_by, reason=reason, is_active=True)
        session.add(ban)
    else:
        ban.banned_by = banned_by
        ban.reason = reason
        ban.is_active = True
    await session.commit()
    await session.refresh(ban)

    guilds = (await session.execute(select(Guild).where(Guild.is_connected_to_network.is_(True)))).scalars().all()

    async def handle(guild_row: Guild) -> BanActionStatus:
        discord_guild = _resolve_guild(client, guild_row.id)
        if discord_guild is None:
            return await _record_action(
                ban.id, guild_row.id, BanActionStatus.SKIPPED, "Bot ist nicht auf diesem Server."
            )
        if not bot_can_ban(discord_guild):
            status = await _record_action(
                ban.id, guild_row.id, BanActionStatus.SKIPPED, "Bot hat keine Ban-Berechtigung."
            )
            await send_guild_log(
                discord_guild,
                title="Global Ban übersprungen",
                description=f"Nutzer `{user_id}` konnte hier nicht gebannt werden (fehlende Rechte).",
                color=0xFAA61A,
                fields=[
                    ("Grund", reason[:1024], False),
                    ("Ausgeführt von", f"<@{banned_by}>", True),
                ],
            )
            return status
        try:
            await discord_guild.ban(
                discord.Object(id=int(user_id)),
                reason=f"[Global Ban] {reason}"[:512],
            )
            status = await _record_action(ban.id, guild_row.id, BanActionStatus.SUCCESS)
            await send_guild_log(
                discord_guild,
                title="Global Ban",
                description=f"Nutzer `{user_id}` wurde global gebannt.",
                color=0xED4245,
                fields=[
                    ("Grund", reason[:1024], False),
                    ("Ausgeführt von", f"<@{banned_by}>", True),
                ],
            )
            return status
        except Exception as error:
            message = str(error) or "Unbekannter Fehler"
            status = await _record_action(ban.id, guild_row.id, BanActionStatus.FAILED, message)
            await send_guild_log(
                discord_guild,
                title="Global Ban fehlgeschlagen",
                description=f"Nutzer `{user_id}` konnte nicht gebannt werden.",
                color=0xED4245,
                fields=[
                    ("Fehler", message[:1024], False),
                    ("Ausgeführt von", f"<@{banned_by}>", True),
                ],
            )
            return status

    statuses = await _map_with_concurrency(list(guilds), settings.ban_concurrency, handle)
    return ban, _summarize(statuses)


async def execute_global_unban(
    session: AsyncSession,
    client: discord.Client,
    *,
    user_id: str,
    executed_by: str,
) -> tuple[GlobalBan | None, BanSummary]:
    result = await session.execute(select(GlobalBan).where(GlobalBan.user_id == user_id))
    existing = result.scalar_one_or_none()
    empty = BanSummary()
    if existing is None or not existing.is_active:
        return existing, empty

    existing.is_active = False
    await session.commit()
    await session.refresh(existing)
    ban = existing

    guilds = (await session.execute(select(Guild).where(Guild.is_connected_to_network.is_(True)))).scalars().all()

    async def handle(guild_row: Guild) -> BanActionStatus:
        discord_guild = _resolve_guild(client, guild_row.id)
        if discord_guild is None:
            return await _record_action(
                ban.id, guild_row.id, BanActionStatus.SKIPPED, "Bot ist nicht auf diesem Server."
            )
        if not bot_can_ban(discord_guild):
            status = await _record_action(
                ban.id, guild_row.id, BanActionStatus.SKIPPED, "Bot hat keine Ban-Berechtigung."
            )
            await send_guild_log(
                discord_guild,
                title="Global Unban übersprungen",
                description=f"Nutzer `{user_id}` konnte hier nicht entbannt werden (fehlende Rechte).",
                color=0xFAA61A,
                fields=[("Ausgeführt von", f"<@{executed_by}>", True)],
            )
            return status
        try:
            await discord_guild.unban(
                discord.Object(id=int(user_id)),
                reason=f"[Global Unban] durch {executed_by}",
            )
            status = await _record_action(ban.id, guild_row.id, BanActionStatus.SUCCESS)
            await send_guild_log(
                discord_guild,
                title="Global Unban",
                description=f"Nutzer `{user_id}` wurde global entbannt.",
                color=0x57F287,
                fields=[("Ausgeführt von", f"<@{executed_by}>", True)],
            )
            return status
        except Exception as error:
            message = str(error) or "Unbekannter Fehler"
            status = await _record_action(ban.id, guild_row.id, BanActionStatus.FAILED, message)
            await send_guild_log(
                discord_guild,
                title="Global Unban fehlgeschlagen",
                description=f"Nutzer `{user_id}` konnte nicht entbannt werden.",
                color=0xED4245,
                fields=[
                    ("Fehler", message[:1024], False),
                    ("Ausgeführt von", f"<@{executed_by}>", True),
                ],
            )
            return status

    statuses = await _map_with_concurrency(list(guilds), settings.ban_concurrency, handle)
    return ban, _summarize(statuses)


async def sync_guild_bans(session: AsyncSession, client: discord.Client, guild_id: str) -> BanSummary:
    discord_guild = _resolve_guild(client, guild_id)
    guild_row = await session.get(Guild, guild_id)
    if discord_guild is None or guild_row is None or not guild_row.is_connected_to_network:
        return BanSummary()

    bans = (await session.execute(select(GlobalBan).where(GlobalBan.is_active.is_(True)))).scalars().all()

    async def handle(ban: GlobalBan) -> BanActionStatus:
        if not bot_can_ban(discord_guild):
            return await _record_action(
                ban.id, guild_id, BanActionStatus.SKIPPED, "Bot hat keine Ban-Berechtigung."
            )
        try:
            await discord_guild.ban(
                discord.Object(id=int(ban.user_id)),
                reason=f"[Global Ban Sync] {ban.reason}"[:512],
            )
            return await _record_action(ban.id, guild_id, BanActionStatus.SUCCESS)
        except Exception as error:
            message = str(error) or "Unbekannter Fehler"
            return await _record_action(ban.id, guild_id, BanActionStatus.FAILED, message)

    statuses = await _map_with_concurrency(list(bans), settings.ban_concurrency, handle)
    summary = _summarize(statuses)
    await send_guild_log(
        discord_guild,
        title="Global-Ban-Sync",
        description="Aktive globale Bans wurden auf diesen Server angewendet.",
        color=0x5865F2,
        fields=[
            ("Erfolgreich", str(summary.success), True),
            ("Fehlgeschlagen", str(summary.failed), True),
            ("Übersprungen", str(summary.skipped), True),
        ],
    )
    return summary


async def get_ban_info(session: AsyncSession, user_id: str) -> GlobalBan | None:
    result = await session.execute(
        select(GlobalBan)
        .where(GlobalBan.user_id == user_id)
        .options(selectinload(GlobalBan.actions))
    )
    ban = result.scalar_one_or_none()
    return ban


def format_summary(summary: BanSummary) -> str:
    return (
        f"Erfolgreich: **{summary.success}** · "
        f"Fehlgeschlagen: **{summary.failed}** · "
        f"Übersprungen: **{summary.skipped}**"
    )
