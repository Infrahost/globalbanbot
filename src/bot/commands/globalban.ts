import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { executeGlobalBan, formatSummary } from "../../services/globalBanService.js";
import { canExecuteGlobalBan } from "../../services/permissionService.js";

export default {
  data: new SlashCommandBuilder()
    .setName("globalban")
    .setDescription("Bannt einen Nutzer auf allen verbundenen Servern des Netzwerks.")
    .addUserOption((option) =>
      option.setName("user").setDescription("Zu bannender Nutzer").setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("grund")
        .setDescription("Grund für den globalen Ban")
        .setRequired(true)
        .setMaxLength(512),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction.reply({ content: "Dieser Befehl funktioniert nur auf einem Server.", ephemeral: true });
      return;
    }

    const allowed = await canExecuteGlobalBan(interaction.user.id, interaction.guildId);
    if (!allowed) {
      await interaction.reply({
        content: "Du darfst keine globalen Bans ausführen. Admins bzw. Mods (falls aktiviert) oder der Bot-Owner.",
        ephemeral: true,
      });
      return;
    }

    const target = interaction.options.getUser("user", true);
    const reason = interaction.options.getString("grund", true);

    if (target.id === interaction.client.user?.id) {
      await interaction.reply({ content: "Der Bot kann sich nicht selbst bannen.", ephemeral: true });
      return;
    }

    if (target.bot) {
      await interaction.reply({ content: "Bots können nicht global gebannt werden.", ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const { summary } = await executeGlobalBan(interaction.client, {
        userId: target.id,
        reason,
        bannedBy: interaction.user.id,
      });

      await interaction.editReply(
        `**${target.tag}** (\`${target.id}\`) wurde global gebannt.\n${formatSummary(summary)}`,
      );
    } catch (error) {
      console.error("globalban failed:", error);
      await interaction.editReply("Der globale Ban ist fehlgeschlagen. Details stehen in den Logs.");
    }
  },
};
