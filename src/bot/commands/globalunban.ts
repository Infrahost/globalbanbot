import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { executeGlobalUnban, formatSummary } from "../../services/globalBanService.js";
import { canExecuteGlobalBan } from "../../services/permissionService.js";

export default {
  data: new SlashCommandBuilder()
    .setName("globalunban")
    .setDescription("Hebt einen globalen Ban auf allen verbundenen Servern auf.")
    .addUserOption((option) =>
      option.setName("user").setDescription("Zu entbannender Nutzer").setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction.reply({ content: "Dieser Befehl funktioniert nur auf einem Server.", ephemeral: true });
      return;
    }

    const allowed = await canExecuteGlobalBan(interaction.user.id, interaction.guildId);
    if (!allowed) {
      await interaction.reply({
        content: "Du darfst keine globalen Unbans ausführen.",
        ephemeral: true,
      });
      return;
    }

    const target = interaction.options.getUser("user", true);
    await interaction.deferReply({ ephemeral: true });

    try {
      const { ban, summary } = await executeGlobalUnban(interaction.client, {
        userId: target.id,
        executedBy: interaction.user.id,
      });

      if (!ban) {
        await interaction.editReply(`Für **${target.tag}** existiert kein globaler Ban.`);
        return;
      }

      if (!ban.isActive && summary.success === 0 && summary.failed === 0 && summary.skipped === 0) {
        await interaction.editReply(`**${target.tag}** ist bereits nicht mehr global gebannt.`);
        return;
      }

      await interaction.editReply(
        `**${target.tag}** (\`${target.id}\`) wurde global entbannt.\n${formatSummary(summary)}`,
      );
    } catch (error) {
      console.error("globalunban failed:", error);
      await interaction.editReply("Der globale Unban ist fehlgeschlagen. Details stehen in den Logs.");
    }
  },
};
