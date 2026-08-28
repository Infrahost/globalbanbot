import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "../../config.js";

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const header = req.header("x-api-key");
  if (!header || !safeEqual(header, config.API_KEY)) {
    res.status(401).json({ error: "Ungültiger oder fehlender API-Key." });
    return;
  }
  next();
}
