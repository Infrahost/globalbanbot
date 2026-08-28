import { Events, type Client, type Guild } from "discord.js";
import { upsertGuildFromDiscord } from "../../services/guildService.js";

export default {
  name: Events.GuildCreate,
  once: false,
  async execute(_client: Client, guild: Guild) {
    try {
      await upsertGuildFromDiscord(guild);
      console.log(`Guild hinzugefügt: ${guild.name} (${guild.id})`);
    } catch (error) {
      console.error("guildCreate fehlgeschlagen:", error);
    }
  },
};
