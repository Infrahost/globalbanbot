import { Events, type Client, type Interaction } from "discord.js";

export default {
  name: Events.InteractionCreate,
  once: false,
  async execute(_client: Client, interaction: Interaction) {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) {
      await interaction.reply({ content: "Unbekannter Befehl.", ephemeral: true }).catch(() => undefined);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`Command ${interaction.commandName} fehlgeschlagen:`, error);
      const message = "Beim Ausführen des Befehls ist ein Fehler aufgetreten.";
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: message, ephemeral: true }).catch(() => undefined);
      } else {
        await interaction.reply({ content: message, ephemeral: true }).catch(() => undefined);
      }
    }
  },
};
