import { Router } from "express";
import { prisma } from "../../database/prisma.js";

export const statsRouter = Router();

statsRouter.get("/", async (_req, res, next) => {
  try {
    const [guildCount, connectedGuildCount, activeBanCount, totalBanRecords] = await Promise.all([
      prisma.guild.count(),
      prisma.guild.count({ where: { isConnectedToNetwork: true } }),
      prisma.globalBan.count({ where: { isActive: true } }),
      prisma.globalBan.count(),
    ]);

    res.json({
      guildCount,
      connectedGuildCount,
      activeBanCount,
      totalBanRecords,
    });
  } catch (error) {
    next(error);
  }
});
