import { EmbedBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { BanActionStatus } from "@prisma/client";
import { getBanInfo } from "../../services/globalBanService.js";
import { canViewBanInfo } from "../../services/permissionService.js";

export default {
  data: new SlashCommandBuilder()
    .setName("baninfo")
    .setDescription("Zeigt Status und Grund eines globalen Bans.")
    .addUserOption((option) =>
      option.setName("user").setDescription("Nutzer, dessen Ban-Status geprüft werden soll").setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction.reply({ content: "Dieser Befehl funktioniert nur auf einem Server.", ephemeral: true });
      return;
    }

    const allowed = await canViewBanInfo(interaction.user.id, interaction.guildId);
    if (!allowed) {
      await interaction.reply({
        content: "Nur Staff (Admin/Mod) und der Bot-Owner können Ban-Infos einsehen.",
        ephemeral: true,
      });
      return;
    }

    const target = interaction.options.getUser("user", true);
    await interaction.deferReply({ ephemeral: true });

    try {
      const ban = await getBanInfo(target.id);
      if (!ban) {
        await interaction.editReply(`Für **${target.tag}** ist kein globaler Ban hinterlegt.`);
        return;
      }

      const success = ban.actions.filter((action) => action.status === BanActionStatus.SUCCESS).length;
      const failed = ban.actions.filter((action) => action.status === BanActionStatus.FAILED).length;
      const skipped = ban.actions.filter((action) => action.status === BanActionStatus.SKIPPED).length;

      const embed = new EmbedBuilder()
        .setTitle(`Global Ban · ${target.tag}`)
        .setColor(ban.isActive ? 0xed4245 : 0x57f287)
        .addFields(
          { name: "Status", value: ban.isActive ? "Aktiv" : "Aufgehoben", inline: true },
          { name: "User-ID", value: `\`${ban.userId}\``, inline: true },
          { name: "Ausgeführt von", value: `<@${ban.bannedBy}>`, inline: true },
          { name: "Grund", value: ban.reason.slice(0, 1024) },
          { name: "Erstellt", value: `<t:${Math.floor(ban.createdAt.getTime() / 1000)}:F>`, inline: true },
          { name: "Aktualisiert", value: `<t:${Math.floor(ban.updatedAt.getTime() / 1000)}:R>`, inline: true },
          {
            name: "Aktionen (letzte 50)",
            value: `Erfolgreich: ${success} · Fehlgeschlagen: ${failed} · Übersprungen: ${skipped}`,
          },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("baninfo failed:", error);
      await interaction.editReply("Ban-Info konnte nicht geladen werden.");
    }
  },
};
