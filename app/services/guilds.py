from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Guild, Staff, StaffRole


async def upsert_guild_from_discord(
    session: AsyncSession, *, guild_id: str, name: str, owner_id: str
) -> Guild:
    guild = await session.get(Guild, guild_id)
    if guild is None:
        guild = Guild(id=guild_id, name=name, owner_id=owner_id)
        session.add(guild)
    else:
        guild.name = name
        guild.owner_id = owner_id
    await session.commit()
    await session.refresh(guild)
    return guild


async def disconnect_guild(session: AsyncSession, guild_id: str) -> None:
    guild = await session.get(Guild, guild_id)
    if guild is None:
        return
    guild.is_connected_to_network = False
    await session.commit()


async def setup_guild(
    session: AsyncSession,
    *,
    guild_id: str,
    name: str,
    owner_id: str,
    log_channel_id: str,
    is_connected_to_network: bool,
    mod_can_execute_ban: bool,
    admin_user_id: str,
) -> Guild:
    guild = await session.get(Guild, guild_id)
    if guild is None:
        guild = Guild(
            id=guild_id,
            name=name,
            owner_id=owner_id,
            log_channel_id=log_channel_id,
            is_connected_to_network=is_connected_to_network,
            mod_can_execute_ban=mod_can_execute_ban,
        )
        session.add(guild)
    else:
        guild.name = name
        guild.owner_id = owner_id
        guild.log_channel_id = log_channel_id
        guild.is_connected_to_network = is_connected_to_network
        guild.mod_can_execute_ban = mod_can_execute_ban

    await session.flush()

    result = await session.execute(
        select(Staff).where(Staff.user_id == admin_user_id, Staff.guild_id == guild_id)
    )
    staff = result.scalar_one_or_none()
    if staff is None:
        session.add(Staff(user_id=admin_user_id, guild_id=guild_id, role=StaffRole.ADMIN))
    else:
        staff.role = StaffRole.ADMIN

    await session.commit()
    await session.refresh(guild)
    return guild


def bot_can_ban(guild) -> bool:
    me = guild.me
    if me is None:
        return False
    return bool(me.guild_permissions.ban_members)
