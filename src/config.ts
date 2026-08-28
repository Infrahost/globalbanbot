import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  CLIENT_ID: z.string().min(1),
  BOT_OWNER_ID: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().int().positive().default(3000),
  API_PREFIX: z.string().default("/api/v1"),
  API_KEY: z.string().min(8),
  BAN_CONCURRENCY: z.coerce.number().int().positive().max(25).default(5),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(`Ungültige Umgebungsvariablen:\n${issues}`);
}

export const config = parsed.data;
