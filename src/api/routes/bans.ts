import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../database/prisma.js";
import { config } from "../../config.js";
import { executeGlobalBan, executeGlobalUnban, getBanInfo } from "../../services/globalBanService.js";
import type { Client } from "discord.js";

const createBanSchema = z.object({
  userId: z.string().min(1),
  reason: z.string().min(1).max(512),
});

export function createBansRouter(client: Client) {
  const router = Router();

  router.get("/", async (req, res, next) => {
    try {
      const active =
        req.query.active === "true" ? true : req.query.active === "false" ? false : undefined;
      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;

      const bans = await prisma.globalBan.findMany({
        where: active === undefined ? undefined : { isActive: active },
        take: limit + 1,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { createdAt: "desc" },
      });

      const hasMore = bans.length > limit;
      const items = hasMore ? bans.slice(0, limit) : bans;
      const nextCursor = hasMore ? items[items.length - 1]?.id : null;

      res.json({ items, nextCursor });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:userId", async (req, res, next) => {
    try {
      const ban = await getBanInfo(req.params.userId);
      if (!ban) {
        res.status(404).json({ error: "Kein globaler Ban für diese User-ID." });
        return;
      }
      res.json(ban);
    } catch (error) {
      next(error);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      const body = createBanSchema.parse(req.body);
      const { ban, summary } = await executeGlobalBan(client, {
        userId: body.userId,
        reason: body.reason,
        bannedBy: config.BOT_OWNER_ID,
      });
      res.status(201).json({ ban, summary });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:userId", async (req, res, next) => {
    try {
      const { ban, summary } = await executeGlobalUnban(client, {
        userId: req.params.userId,
        executedBy: config.BOT_OWNER_ID,
      });
      if (!ban) {
        res.status(404).json({ error: "Kein globaler Ban für diese User-ID." });
        return;
      }
      res.json({ ban, summary });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
