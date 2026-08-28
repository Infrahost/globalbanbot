from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_session
from app.models import GlobalBan, Guild
from app.schemas import CreateBanBody, GlobalBanDetail, GlobalBanOut, GuildOut, StatsOut
from app.services.global_bans import execute_global_ban, execute_global_unban, get_ban_info

router = APIRouter()


@router.get("/stats", response_model=StatsOut)
async def stats(session: AsyncSession = Depends(get_session)) -> StatsOut:
    guild_count = await session.scalar(select(func.count()).select_from(Guild)) or 0
    connected = (
        await session.scalar(
            select(func.count()).select_from(Guild).where(Guild.is_connected_to_network.is_(True))
        )
        or 0
    )
    active = (
        await session.scalar(select(func.count()).select_from(GlobalBan).where(GlobalBan.is_active.is_(True))) or 0
    )
    total = await session.scalar(select(func.count()).select_from(GlobalBan)) or 0
    return StatsOut(
        guild_count=guild_count,
        connected_guild_count=connected,
        active_ban_count=active,
        total_ban_records=total,
    )


@router.get("/guilds")
async def list_guilds(session: AsyncSession = Depends(get_session)) -> dict:
    result = await session.execute(select(Guild).order_by(Guild.name.asc()))
    items = [GuildOut.model_validate(row) for row in result.scalars().all()]
    return {"items": items}


@router.get("/bans")
async def list_bans(
    session: AsyncSession = Depends(get_session),
    active: bool | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    cursor: str | None = Query(default=None),
) -> dict:
    query = select(GlobalBan).order_by(GlobalBan.created_at.desc())
    if active is not None:
        query = query.where(GlobalBan.is_active.is_(active))
    if cursor:
        current = await session.get(GlobalBan, cursor)
        if current is not None:
            query = query.where(GlobalBan.created_at < current.created_at)
    query = query.limit(limit + 1)
    rows = list((await session.execute(query)).scalars().all())
    has_more = len(rows) > limit
    items = rows[:limit]
    next_cursor = items[-1].id if has_more and items else None
    return {"items": [GlobalBanOut.model_validate(item) for item in items], "nextCursor": next_cursor}


@router.get("/bans/{user_id}")
async def ban_detail(user_id: str, session: AsyncSession = Depends(get_session)) -> GlobalBanDetail:
    ban = await get_ban_info(session, user_id)
    if ban is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kein globaler Ban für diese User-ID.")
    data = GlobalBanDetail.model_validate(ban)
    data.actions = sorted(data.actions, key=lambda action: action.created_at, reverse=True)[:50]
    return data


@router.post("/bans", status_code=status.HTTP_201_CREATED)
async def create_ban(request: Request, session: AsyncSession = Depends(get_session)):
    try:
        body = CreateBanBody.model_validate(await request.json())
    except ValidationError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error.errors()) from error
    except Exception as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ungültiger Request-Body") from error

    bot = request.app.state.bot
    ban, summary = await execute_global_ban(
        session,
        bot,
        user_id=body.user_id,
        reason=body.reason,
        banned_by=settings.bot_owner_id,
    )
    return {"ban": GlobalBanOut.model_validate(ban), "summary": summary}


@router.delete("/bans/{user_id}")
async def delete_ban(user_id: str, request: Request, session: AsyncSession = Depends(get_session)):
    bot = request.app.state.bot
    ban, summary = await execute_global_unban(
        session,
        bot,
        user_id=user_id,
        executed_by=settings.bot_owner_id,
    )
    if ban is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kein globaler Ban für diese User-ID.")
    return {"ban": GlobalBanOut.model_validate(ban), "summary": summary}
