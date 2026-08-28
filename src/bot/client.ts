import { Client, Collection, GatewayIntentBits } from "discord.js";
import type { SlashCommandModule } from "../types/index.js";

export function createBotClient() {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildModeration],
  });

  client.commands = new Collection<string, SlashCommandModule>();
  return client;
}

declare module "discord.js" {
  interface Client {
    commands: Collection<string, SlashCommandModule>;
  }
}
