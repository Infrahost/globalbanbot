import { BanActionStatus, type GlobalBan } from "@prisma/client";
import { type Client, type Guild } from "discord.js";
import { config } from "../config.js";
import { prisma } from "../database/prisma.js";
import type { BanSummary } from "../types/index.js";
import { botCanBan } from "./guildService.js";
import { sendGuildLog } from "./logService.js";

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current]!);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function summarize(statuses: BanActionStatus[]): BanSummary {
  return statuses.reduce<BanSummary>(
    (acc, status) => {
      if (status === BanActionStatus.SUCCESS) acc.success += 1;
      else if (status === BanActionStatus.FAILED) acc.failed += 1;
      else acc.skipped += 1;
      return acc;
    },
    { success: 0, failed: 0, skipped: 0 },
  );
}

async function recordAction(
  globalBanId: string,
  guildId: string,
  status: BanActionStatus,
  error?: string,
) {
  await prisma.banAction.create({
    data: { globalBanId, guildId, status, error },
  });
  return status;
}

function resolveDiscordGuild(client: Client, guildId: string): Guild | undefined {
  return client.guilds.cache.get(guildId);
}

/**
 * Applies a global ban to every connected guild with a bounded concurrency queue.
 */
export async function executeGlobalBan(
  client: Client,
  options: { userId: string; reason: string; bannedBy: string },
): Promise<{ ban: GlobalBan; summary: BanSummary }> {
  const ban = await prisma.globalBan.upsert({
    where: { userId: options.userId },
    create: {
      userId: options.userId,
      bannedBy: options.bannedBy,
      reason: options.reason,
      isActive: true,
    },
    update: {
      bannedBy: options.bannedBy,
      reason: options.reason,
      isActive: true,
    },
  });

  const guilds = await prisma.guild.findMany({
    where: { isConnectedToNetwork: true },
  });

  const statuses = await mapWithConcurrency(guilds, config.BAN_CONCURRENCY, async (guildRow) => {
    const discordGuild = resolveDiscordGuild(client, guildRow.id);
    if (!discordGuild) {
      return recordAction(ban.id, guildRow.id, BanActionStatus.SKIPPED, "Bot ist nicht auf diesem Server.");
    }

    if (!botCanBan(discordGuild)) {
      const status = await recordAction(
        ban.id,
        guildRow.id,
        BanActionStatus.SKIPPED,
        "Bot hat keine Ban-Berechtigung.",
      );
      await sendGuildLog(discordGuild, {
        title: "Global Ban übersprungen",
        description: `Nutzer \`${options.userId}\` konnte hier nicht gebannt werden (fehlende Rechte).`,
        color: 0xfaa61a,
        fields: [
          { name: "Grund", value: options.reason.slice(0, 1024) },
          { name: "Ausgeführt von", value: `<@${options.bannedBy}>`, inline: true },
        ],
      });
      return status;
    }

    try {
      await discordGuild.members.ban(options.userId, {
        reason: `[Global Ban] ${options.reason}`.slice(0, 512),
      });
      const status = await recordAction(ban.id, guildRow.id, BanActionStatus.SUCCESS);
      await sendGuildLog(discordGuild, {
        title: "Global Ban",
        description: `Nutzer \`${options.userId}\` wurde global gebannt.`,
        color: 0xed4245,
        fields: [
          { name: "Grund", value: options.reason.slice(0, 1024) },
          { name: "Ausgeführt von", value: `<@${options.bannedBy}>`, inline: true },
        ],
      });
      return status;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unbekannter Fehler";
      const status = await recordAction(ban.id, guildRow.id, BanActionStatus.FAILED, message);
      await sendGuildLog(discordGuild, {
        title: "Global Ban fehlgeschlagen",
        description: `Nutzer \`${options.userId}\` konnte nicht gebannt werden.`,
        color: 0xed4245,
        fields: [
          { name: "Fehler", value: message.slice(0, 1024) },
          { name: "Ausgeführt von", value: `<@${options.bannedBy}>`, inline: true },
        ],
      });
      return status;
    }
  });

  return { ban, summary: summarize(statuses) };
}

/**
 * Deactivates a global ban and unbans the user on connected guilds.
 */
export async function executeGlobalUnban(
  client: Client,
  options: { userId: string; executedBy: string },
): Promise<{ ban: GlobalBan | null; summary: BanSummary }> {
  const existing = await prisma.globalBan.findUnique({ where: { userId: options.userId } });
  if (!existing || !existing.isActive) {
    return { ban: existing, summary: { success: 0, failed: 0, skipped: 0 } };
  }

  const ban = await prisma.globalBan.update({
    where: { userId: options.userId },
    data: { isActive: false },
  });

  const guilds = await prisma.guild.findMany({
    where: { isConnectedToNetwork: true },
  });

  const statuses = await mapWithConcurrency(guilds, config.BAN_CONCURRENCY, async (guildRow) => {
    const discordGuild = resolveDiscordGuild(client, guildRow.id);
    if (!discordGuild) {
      return recordAction(ban.id, guildRow.id, BanActionStatus.SKIPPED, "Bot ist nicht auf diesem Server.");
    }

    if (!botCanBan(discordGuild)) {
      const status = await recordAction(
        ban.id,
        guildRow.id,
        BanActionStatus.SKIPPED,
        "Bot hat keine Ban-Berechtigung.",
      );
      await sendGuildLog(discordGuild, {
        title: "Global Unban übersprungen",
        description: `Nutzer \`${options.userId}\` konnte hier nicht entbannt werden (fehlende Rechte).`,
        color: 0xfaa61a,
        fields: [{ name: "Ausgeführt von", value: `<@${options.executedBy}>`, inline: true }],
      });
      return status;
    }

    try {
      await discordGuild.bans.remove(options.userId, `[Global Unban] durch ${options.executedBy}`);
      const status = await recordAction(ban.id, guildRow.id, BanActionStatus.SUCCESS);
      await sendGuildLog(discordGuild, {
        title: "Global Unban",
        description: `Nutzer \`${options.userId}\` wurde global entbannt.`,
        color: 0x57f287,
        fields: [{ name: "Ausgeführt von", value: `<@${options.executedBy}>`, inline: true }],
      });
      return status;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unbekannter Fehler";
      const status = await recordAction(ban.id, guildRow.id, BanActionStatus.FAILED, message);
      await sendGuildLog(discordGuild, {
        title: "Global Unban fehlgeschlagen",
        description: `Nutzer \`${options.userId}\` konnte nicht entbannt werden.`,
        color: 0xed4245,
        fields: [
          { name: "Fehler", value: message.slice(0, 1024) },
          { name: "Ausgeführt von", value: `<@${options.executedBy}>`, inline: true },
        ],
      });
      return status;
    }
  });

  return { ban, summary: summarize(statuses) };
}

/**
 * Applies all currently active global bans to a single connected guild.
 */
export async function syncGuildBans(client: Client, guildId: string): Promise<BanSummary> {
  const discordGuild = resolveDiscordGuild(client, guildId);
  const guildRow = await prisma.guild.findUnique({ where: { id: guildId } });

  if (!discordGuild || !guildRow?.isConnectedToNetwork) {
    return { success: 0, failed: 0, skipped: 0 };
  }

  const activeBans = await prisma.globalBan.findMany({ where: { isActive: true } });

  const statuses = await mapWithConcurrency(activeBans, config.BAN_CONCURRENCY, async (ban) => {
    if (!botCanBan(discordGuild)) {
      return recordAction(ban.id, guildId, BanActionStatus.SKIPPED, "Bot hat keine Ban-Berechtigung.");
    }

    try {
      await discordGuild.members.ban(ban.userId, {
        reason: `[Global Ban Sync] ${ban.reason}`.slice(0, 512),
      });
      return recordAction(ban.id, guildId, BanActionStatus.SUCCESS);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unbekannter Fehler";
      return recordAction(ban.id, guildId, BanActionStatus.FAILED, message);
    }
  });

  const summary = summarize(statuses);

  await sendGuildLog(discordGuild, {
    title: "Global-Ban-Sync",
    description: `Aktive globale Bans wurden auf diesen Server angewendet.`,
    color: 0x5865f2,
    fields: [
      { name: "Erfolgreich", value: String(summary.success), inline: true },
      { name: "Fehlgeschlagen", value: String(summary.failed), inline: true },
      { name: "Übersprungen", value: String(summary.skipped), inline: true },
    ],
  });

  return summary;
}

export async function getBanInfo(userId: string) {
  return prisma.globalBan.findUnique({
    where: { userId },
    include: {
      actions: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });
}

export function formatSummary(summary: BanSummary): string {
  return `Erfolgreich: **${summary.success}** · Fehlgeschlagen: **${summary.failed}** · Übersprungen: **${summary.skipped}**`;
}
