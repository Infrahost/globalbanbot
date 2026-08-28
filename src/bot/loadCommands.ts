import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Client } from "discord.js";
import type { SlashCommandModule } from "../types/index.js";

const commandsDir = join(dirname(fileURLToPath(import.meta.url)), "commands");

export async function loadCommands(client: Client): Promise<SlashCommandModule[]> {
  const files = (await readdir(commandsDir)).filter(
    (file) => file.endsWith(".ts") || file.endsWith(".js"),
  );
  const loaded: SlashCommandModule[] = [];

  for (const file of files) {
    const moduleUrl = pathToFileURL(join(commandsDir, file)).href;
    const imported = (await import(moduleUrl)) as { default: SlashCommandModule };
    const command = imported.default;
    client.commands.set(command.data.name, command);
    loaded.push(command);
  }

  return loaded;
}
