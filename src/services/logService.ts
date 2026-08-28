import {
  EmbedBuilder,
  type Client,
  type ColorResolvable,
  type Guild,
  type TextBasedChannel,
} from "discord.js";
import { prisma } from "../database/prisma.js";

type LogPayload = {
  title: string;
  description: string;
  color?: ColorResolvable;
  fields?: { name: string; value: string; inline?: boolean }[];
};

export async function sendGuildLog(guild: Guild, payload: LogPayload): Promise<void> {
  const record = await prisma.guild.findUnique({ where: { id: guild.id } });
  if (!record?.logChannelId) {
    return;
  }

  try {
    const channel = await guild.channels.fetch(record.logChannelId);
    if (!channel || !channel.isTextBased()) {
      return;
    }
    await sendLogEmbed(channel, payload);
  } catch (error) {
    console.error(`Log-Kanal für Guild ${guild.id} nicht erreichbar:`, error);
  }
}

async function sendLogEmbed(channel: TextBasedChannel, payload: LogPayload): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle(payload.title)
    .setDescription(payload.description)
    .setColor(payload.color ?? 0xed4245)
    .setTimestamp();

  if (payload.fields?.length) {
    embed.addFields(payload.fields);
  }

  if (channel.isSendable()) {
    await channel.send({ embeds: [embed] });
  }
}

export async function sendNetworkLogs(
  client: Client,
  guildIds: string[],
  payload: LogPayload,
): Promise<void> {
  await Promise.all(
    guildIds.map(async (guildId) => {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        return;
      }
      await sendGuildLog(guild, payload);
    }),
  );
}
