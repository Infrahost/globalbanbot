import { Router } from "express";
import { prisma } from "../../database/prisma.js";

export const guildsRouter = Router();

guildsRouter.get("/", async (_req, res, next) => {
  try {
    const guilds = await prisma.guild.findMany({
      select: {
        id: true,
        name: true,
        ownerId: true,
        isConnectedToNetwork: true,
        logChannelId: true,
        modCanExecuteBan: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { name: "asc" },
    });
    res.json({ items: guilds });
  } catch (error) {
    next(error);
  }
});
