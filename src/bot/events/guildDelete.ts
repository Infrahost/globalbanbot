import { Events, type Client, type Guild } from "discord.js";
import { disconnectGuild } from "../../services/guildService.js";

export default {
  name: Events.GuildDelete,
  once: false,
  async execute(_client: Client, guild: Guild) {
    try {
      await disconnectGuild(guild.id);
      console.log(`Guild getrennt: ${guild.name} (${guild.id})`);
    } catch (error) {
      console.error("guildDelete fehlgeschlagen:", error);
    }
  },
};
