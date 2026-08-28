import logging

import discord

from app.database import SessionLocal
from app.models import Guild

logger = logging.getLogger(__name__)


async def send_guild_log(
    guild: discord.Guild,
    *,
    title: str,
    description: str,
    color: int = 0xED4245,
    fields: list[tuple[str, str, bool]] | None = None,
) -> None:
    async with SessionLocal() as session:
        record = await session.get(Guild, str(guild.id))
        channel_id = record.log_channel_id if record else None

    if not channel_id:
        return

    try:
        channel = guild.get_channel(int(channel_id)) or await guild.fetch_channel(int(channel_id))
    except Exception:
        logger.exception("Log-Kanal für Guild %s nicht erreichbar", guild.id)
        return

    if not isinstance(channel, discord.TextChannel) and not isinstance(channel, discord.Thread):
        return

    embed = discord.Embed(title=title, description=description, color=color)
    for name, value, inline in fields or []:
        embed.add_field(name=name, value=value, inline=inline)
    embed.timestamp = discord.utils.utcnow()

    try:
        await channel.send(embed=embed)
    except Exception:
        logger.exception("Log-Nachricht in Guild %s fehlgeschlagen", guild.id)
