import { StaffRole } from "@prisma/client";
import { PermissionFlagsBits, type GuildMember } from "discord.js";
import { config } from "../config.js";
import { prisma } from "../database/prisma.js";

export function isBotOwner(userId: string): boolean {
  return userId === config.BOT_OWNER_ID;
}

export async function getStaffRole(userId: string, guildId: string): Promise<StaffRole | null> {
  if (isBotOwner(userId)) {
    return StaffRole.ADMIN;
  }

  const staff = await prisma.staff.findUnique({
    where: { userId_guildId: { userId, guildId } },
  });

  return staff?.role ?? null;
}

export async function canSetupGuild(member: GuildMember): Promise<boolean> {
  if (isBotOwner(member.id)) {
    return true;
  }
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

export async function canManageStaff(userId: string, guildId: string): Promise<boolean> {
  const role = await getStaffRole(userId, guildId);
  return role === StaffRole.ADMIN;
}

export async function canViewBanInfo(userId: string, guildId: string): Promise<boolean> {
  const role = await getStaffRole(userId, guildId);
  return role === StaffRole.ADMIN || role === StaffRole.MOD;
}

export async function canExecuteGlobalBan(userId: string, guildId: string): Promise<boolean> {
  if (isBotOwner(userId)) {
    return true;
  }

  const [role, guild] = await Promise.all([
    getStaffRole(userId, guildId),
    prisma.guild.findUnique({ where: { id: guildId } }),
  ]);

  if (role === StaffRole.ADMIN) {
    return true;
  }

  if (role === StaffRole.MOD && guild?.modCanExecuteBan) {
    return true;
  }

  return false;
}

export async function addStaff(guildId: string, userId: string, role: StaffRole) {
  return prisma.staff.upsert({
    where: { userId_guildId: { userId, guildId } },
    create: { userId, guildId, role },
    update: { role },
  });
}

export async function removeStaff(guildId: string, userId: string) {
  return prisma.staff.deleteMany({
    where: { guildId, userId },
  });
}
