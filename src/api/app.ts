import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import type { Client } from "discord.js";
import { ZodError } from "zod";
import { config } from "../config.js";
import { requireApiKey } from "./middleware/apiKey.js";
import { createBansRouter } from "./routes/bans.js";
import { guildsRouter } from "./routes/guilds.js";
import { statsRouter } from "./routes/stats.js";

export function createApi(client: Client) {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "32kb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, guilds: client.guilds.cache.size });
  });

  const api = express.Router();
  api.use(requireApiKey);
  api.use("/stats", statsRouter);
  api.use("/bans", createBansRouter(client));
  api.use("/guilds", guildsRouter);

  app.use(config.API_PREFIX, api);

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ZodError) {
      res.status(400).json({ error: "Ungültiger Request-Body", details: error.issues });
      return;
    }
    console.error("API error:", error);
    res.status(500).json({ error: "Interner Serverfehler." });
  });

  return app;
}
