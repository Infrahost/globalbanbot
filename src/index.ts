import { createApi } from "./api/app.js";
import { createBotClient } from "./bot/client.js";
import { loadCommands } from "./bot/loadCommands.js";
import { registerEvents } from "./bot/registerEvents.js";
import { config } from "./config.js";
import { prisma } from "./database/prisma.js";

async function main() {
  const client = createBotClient();
  await loadCommands(client);
  await registerEvents(client);

  const app = createApi(client);
  const server = app.listen(config.API_PORT, () => {
    console.log(`API läuft auf Port ${config.API_PORT} (${config.API_PREFIX})`);
  });

  await client.login(config.DISCORD_TOKEN);

  const shutdown = async (signal: string) => {
    console.log(`${signal} empfangen, fahre herunter…`);
    server.close();
    client.destroy();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch(async (error) => {
  console.error("Start fehlgeschlagen:", error);
  await prisma.$disconnect();
  process.exit(1);
});
