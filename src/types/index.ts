import type {
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";
import { StaffRole } from "@prisma/client";

export { StaffRole };

export type BanSummary = {
  success: number;
  failed: number;
  skipped: number;
};

export type SlashCommandModule = {
  data: {
    name: string;
    toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody;
  };
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
};
