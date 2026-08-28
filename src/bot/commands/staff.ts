import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { StaffRole } from "@prisma/client";
import { addStaff, canManageStaff, removeStaff } from "../../services/permissionService.js";

export default {
  data: new SlashCommandBuilder()
    .setName("staff")
    .setDescription("Verwaltet globale Moderatoren und Administratoren dieses Servers.")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Weist einem Nutzer eine Staff-Rolle zu.")
        .addUserOption((option) => option.setName("user").setDescription("Nutzer").setRequired(true))
        .addStringOption((option) =>
          option
            .setName("rolle")
            .setDescription("Staff-Rolle")
            .setRequired(true)
            .addChoices(
              { name: "Administrator", value: StaffRole.ADMIN },
              { name: "Moderator", value: StaffRole.MOD },
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Entfernt die Staff-Rolle eines Nutzers.")
        .addUserOption((option) => option.setName("user").setDescription("Nutzer").setRequired(true)),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction.reply({ content: "Dieser Befehl funktioniert nur auf einem Server.", ephemeral: true });
      return;
    }

    const allowed = await canManageStaff(interaction.user.id, interaction.guildId);
    if (!allowed) {
      await interaction.reply({
        content: "Nur Admins und der Bot-Owner können Staff verwalten.",
        ephemeral: true,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();
    const target = interaction.options.getUser("user", true);

    await interaction.deferReply({ ephemeral: true });

    try {
      if (sub === "add") {
        const role = interaction.options.getString("rolle", true) as StaffRole;
        await addStaff(interaction.guildId, target.id, role);
        await interaction.editReply(`**${target.tag}** ist jetzt **${role}** auf diesem Server.`);
        return;
      }

      await removeStaff(interaction.guildId, target.id);
      await interaction.editReply(`Staff-Eintrag für **${target.tag}** wurde entfernt.`);
    } catch (error) {
      console.error("staff failed:", error);
      await interaction.editReply("Staff-Änderung ist fehlgeschlagen.");
    }
  },
};
