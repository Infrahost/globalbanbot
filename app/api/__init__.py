from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.deps import require_api_key
from app.api.routes import router
from app.config import settings


def create_api() -> FastAPI:
    app = FastAPI(title="Global Ban Bot API", version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    async def health() -> dict:
        bot = getattr(app.state, "bot", None)
        guilds = len(bot.guilds) if bot is not None else 0
        return {"ok": True, "guilds": guilds}

    app.include_router(router, prefix=settings.api_prefix, dependencies=[Depends(require_api_key)])
    return app
