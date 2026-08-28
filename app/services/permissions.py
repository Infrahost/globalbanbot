from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Guild, Staff, StaffRole


def is_bot_owner(user_id: str) -> bool:
    return user_id == settings.bot_owner_id


async def get_staff_role(session: AsyncSession, user_id: str, guild_id: str) -> StaffRole | None:
    if is_bot_owner(user_id):
        return StaffRole.ADMIN
    result = await session.execute(
        select(Staff).where(Staff.user_id == user_id, Staff.guild_id == guild_id)
    )
    staff = result.scalar_one_or_none()
    return staff.role if staff else None


def can_setup_guild(user_id: str, is_administrator: bool) -> bool:
    return is_bot_owner(user_id) or is_administrator


async def can_manage_staff(session: AsyncSession, user_id: str, guild_id: str) -> bool:
    return await get_staff_role(session, user_id, guild_id) == StaffRole.ADMIN


async def can_view_ban_info(session: AsyncSession, user_id: str, guild_id: str) -> bool:
    role = await get_staff_role(session, user_id, guild_id)
    return role in {StaffRole.ADMIN, StaffRole.MOD}


async def can_execute_global_ban(session: AsyncSession, user_id: str, guild_id: str) -> bool:
    if is_bot_owner(user_id):
        return True
    role = await get_staff_role(session, user_id, guild_id)
    guild = await session.get(Guild, guild_id)
    if role == StaffRole.ADMIN:
        return True
    if role == StaffRole.MOD and guild is not None and guild.mod_can_execute_ban:
        return True
    return False


async def add_staff(session: AsyncSession, guild_id: str, user_id: str, role: StaffRole) -> Staff:
    result = await session.execute(
        select(Staff).where(Staff.user_id == user_id, Staff.guild_id == guild_id)
    )
    staff = result.scalar_one_or_none()
    if staff is None:
        staff = Staff(user_id=user_id, guild_id=guild_id, role=role)
        session.add(staff)
    else:
        staff.role = role
    await session.commit()
    await session.refresh(staff)
    return staff


async def remove_staff(session: AsyncSession, guild_id: str, user_id: str) -> None:
    result = await session.execute(
        select(Staff).where(Staff.user_id == user_id, Staff.guild_id == guild_id)
    )
    staff = result.scalar_one_or_none()
    if staff is not None:
        await session.delete(staff)
        await session.commit()
