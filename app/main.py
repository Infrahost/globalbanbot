from __future__ import annotations

import asyncio
import logging

import uvicorn

from app.api import create_api
from app.bot.client import GlobalBanBot
from app.config import settings
from app.database import engine, init_db

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


async def run() -> None:
    await init_db()
    bot = GlobalBanBot()
    api = create_api()
    api.state.bot = bot

    config = uvicorn.Config(api, host="0.0.0.0", port=settings.api_port, log_level="info")
    server = uvicorn.Server(config)
    server.install_signal_handlers = False

    try:
        await asyncio.gather(server.serve(), bot.start(settings.discord_token))
    finally:
        if not bot.is_closed():
            await bot.close()
        await engine.dispose()


def main() -> None:
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        logger.info("Beendet.")


if __name__ == "__main__":
    main()
