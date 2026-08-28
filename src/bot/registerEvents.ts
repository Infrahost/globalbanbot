import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Client, ClientEvents } from "discord.js";

type EventModule = {
  name: keyof ClientEvents;
  once?: boolean;
  // Event payloads vary; handlers receive the bot client plus Discord.js args.
  execute: (client: Client, ...args: unknown[]) => Promise<void> | void;
};

const eventsDir = join(dirname(fileURLToPath(import.meta.url)), "events");

export async function registerEvents(client: Client): Promise<void> {
  const files = (await readdir(eventsDir)).filter(
    (file) => file.endsWith(".ts") || file.endsWith(".js"),
  );

  for (const file of files) {
    const moduleUrl = pathToFileURL(join(eventsDir, file)).href;
    const imported = (await import(moduleUrl)) as { default: EventModule };
    const event = imported.default;

    const handler = (...args: unknown[]) => event.execute(client, ...args);

    if (event.once) {
      client.once(event.name, handler as (...args: ClientEvents[typeof event.name]) => void);
    } else {
      client.on(event.name, handler as (...args: ClientEvents[typeof event.name]) => void);
    }
  }
}
