import {
  ChannelType,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import { setupGuild } from "../../services/guildService.js";
import { canSetupGuild } from "../../services/permissionService.js";

export default {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Verbindet diesen Server mit dem globalen Bann-Netzwerk.")
    .addChannelOption((option) =>
      option
        .setName("log_channel")
        .setDescription("Kanal für globale Ban-Logs")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true),
    )
    .addBooleanOption((option) =>
      option
        .setName("verbunden")
        .setDescription("Server mit dem Netzwerk verbinden (Standard: ja)")
        .setRequired(false),
    )
    .addBooleanOption((option) =>
      option
        .setName("mods_koennen_bannen")
        .setDescription("Dürfen Mods globale Bans ausführen? (Standard: nein)")
        .setRequired(false),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guild || !interaction.guildId) {
      await interaction.reply({ content: "Dieser Befehl funktioniert nur auf einem Server.", ephemeral: true });
      return;
    }

    const member = interaction.member as GuildMember;
    const allowed = await canSetupGuild(member);
    if (!allowed) {
      await interaction.reply({
        content: "Nur Discord-Administratoren oder der Bot-Owner können /setup ausführen.",
        ephemeral: true,
      });
      return;
    }

    const logChannel = interaction.options.getChannel("log_channel", true);
    const connected = interaction.options.getBoolean("verbunden") ?? true;
    const modCanExecuteBan = interaction.options.getBoolean("mods_koennen_bannen") ?? false;

    await interaction.deferReply({ ephemeral: true });

    try {
      await setupGuild({
        guildId: interaction.guild.id,
        name: interaction.guild.name,
        ownerId: interaction.guild.ownerId,
        logChannelId: logChannel.id,
        isConnectedToNetwork: connected,
        modCanExecuteBan,
        adminUserId: interaction.user.id,
      });

      await interaction.editReply(
        [
          connected
            ? "Dieser Server ist mit dem globalen Bann-Netzwerk verbunden."
            : "Dieser Server ist **nicht** mit dem Netzwerk verbunden.",
          `Log-Kanal: <#${logChannel.id}>`,
          `Mods dürfen globale Bans ausführen: **${modCanExecuteBan ? "ja" : "nein"}**`,
          `Du wurdest als **ADMIN** für diesen Server hinterlegt.`,
        ].join("\n"),
      );
    } catch (error) {
      console.error("setup failed:", error);
      await interaction.editReply("Setup ist fehlgeschlagen. Prüfe die Datenbankverbindung.");
    }
  },
};
