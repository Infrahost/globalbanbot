import { PermissionFlagsBits, type Guild as DiscordGuild } from "discord.js";
import { prisma } from "../database/prisma.js";

export async function upsertGuildFromDiscord(guild: DiscordGuild) {
  return prisma.guild.upsert({
    where: { id: guild.id },
    create: {
      id: guild.id,
      name: guild.name,
      ownerId: guild.ownerId,
    },
    update: {
      name: guild.name,
      ownerId: guild.ownerId,
    },
  });
}

export async function disconnectGuild(guildId: string) {
  await prisma.guild.updateMany({
    where: { id: guildId },
    data: { isConnectedToNetwork: false },
  });
}

export async function setupGuild(options: {
  guildId: string;
  name: string;
  ownerId: string;
  logChannelId: string;
  isConnectedToNetwork: boolean;
  modCanExecuteBan: boolean;
  adminUserId: string;
}) {
  const guild = await prisma.guild.upsert({
    where: { id: options.guildId },
    create: {
      id: options.guildId,
      name: options.name,
      ownerId: options.ownerId,
      logChannelId: options.logChannelId,
      isConnectedToNetwork: options.isConnectedToNetwork,
      modCanExecuteBan: options.modCanExecuteBan,
    },
    update: {
      name: options.name,
      ownerId: options.ownerId,
      logChannelId: options.logChannelId,
      isConnectedToNetwork: options.isConnectedToNetwork,
      modCanExecuteBan: options.modCanExecuteBan,
    },
  });

  await prisma.staff.upsert({
    where: {
      userId_guildId: {
        userId: options.adminUserId,
        guildId: options.guildId,
      },
    },
    create: {
      userId: options.adminUserId,
      guildId: options.guildId,
      role: "ADMIN",
    },
    update: { role: "ADMIN" },
  });

  return guild;
}

export async function listConnectedGuilds() {
  return prisma.guild.findMany({
    where: { isConnectedToNetwork: true },
    orderBy: { name: "asc" },
  });
}

/** True if the bot can ban members in this Discord guild. */
export function botCanBan(guild: DiscordGuild): boolean {
  const me = guild.members.me;
  if (!me) {
    return false;
  }
  return me.permissions.has(PermissionFlagsBits.BanMembers);
}
