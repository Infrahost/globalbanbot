import { Events, type Client } from "discord.js";
import { deployCommands } from "../deployCommands.js";

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client: Client<true>) {
    try {
      await deployCommands([...client.commands.values()]);
    } catch (error) {
      console.error("Slash-Commands konnten nicht registriert werden:", error);
    }
    console.log(`Eingeloggt als ${client.user.tag} · ${client.guilds.cache.size} Server`);
  },
};
