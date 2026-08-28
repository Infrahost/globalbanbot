from __future__ import annotations

import logging

import discord
from discord.ext import commands

from app.database import SessionLocal
from app.services.guilds import disconnect_guild, upsert_guild_from_discord

logger = logging.getLogger(__name__)


class GlobalBanBot(commands.Bot):
    def __init__(self) -> None:
        intents = discord.Intents.default()
        intents.moderation = True
        super().__init__(command_prefix=commands.when_mentioned, intents=intents)

    async def setup_hook(self) -> None:
        await self.load_extension("app.bot.cogs.network")
        synced = await self.tree.sync()
        logger.info("%s globale Slash-Commands registriert.", len(synced))

    async def on_ready(self) -> None:
        logger.info("Eingeloggt als %s · %s Server", self.user, len(self.guilds))

    async def on_guild_join(self, guild: discord.Guild) -> None:
        try:
            async with SessionLocal() as session:
                await upsert_guild_from_discord(
                    session,
                    guild_id=str(guild.id),
                    name=guild.name,
                    owner_id=str(guild.owner_id or 0),
                )
            logger.info("Guild hinzugefügt: %s (%s)", guild.name, guild.id)
        except Exception:
            logger.exception("on_guild_join fehlgeschlagen")

    async def on_guild_remove(self, guild: discord.Guild) -> None:
        try:
            async with SessionLocal() as session:
                await disconnect_guild(session, str(guild.id))
            logger.info("Guild getrennt: %s (%s)", guild.name, guild.id)
        except Exception:
            logger.exception("on_guild_remove fehlgeschlagen")
