import { REST, Routes } from "discord.js";
import { config } from "../config.js";
import type { SlashCommandModule } from "../types/index.js";

export async function deployCommands(commands: SlashCommandModule[]): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);
  const body = commands.map((command) => command.data.toJSON());

  await rest.put(Routes.applicationCommands(config.CLIENT_ID), { body });
  console.log(`${body.length} globale Slash-Commands registriert.`);
}
