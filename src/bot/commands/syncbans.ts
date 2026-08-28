import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { formatSummary, syncGuildBans } from "../../services/globalBanService.js";
import { canManageStaff } from "../../services/permissionService.js";
import { prisma } from "../../database/prisma.js";

export default {
  data: new SlashCommandBuilder()
    .setName("syncbans")
    .setDescription("Wendet alle aktiven globalen Bans auf diesen Server an."),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction.reply({ content: "Dieser Befehl funktioniert nur auf einem Server.", ephemeral: true });
      return;
    }

    const allowed = await canManageStaff(interaction.user.id, interaction.guildId);
    if (!allowed) {
      await interaction.reply({
        content: "Nur Admins und der Bot-Owner können den Ban-Sync starten.",
        ephemeral: true,
      });
      return;
    }

    const guild = await prisma.guild.findUnique({ where: { id: interaction.guildId } });
    if (!guild?.isConnectedToNetwork) {
      await interaction.reply({
        content: "Dieser Server ist nicht mit dem Netzwerk verbunden. Führe zuerst /setup aus.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const summary = await syncGuildBans(interaction.client, interaction.guildId);
      await interaction.editReply(`Sync abgeschlossen.\n${formatSummary(summary)}`);
    } catch (error) {
      console.error("syncbans failed:", error);
      await interaction.editReply("Sync ist fehlgeschlagen.");
    }
  },
};
