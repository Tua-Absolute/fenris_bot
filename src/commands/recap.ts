import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type GuildTextBasedChannel } from "discord.js";
import { config } from "../config.js";
import { takeQuota } from "../ai/quota.js";
import { postRecap } from "../features/weeklyRecap.js";
import { UserError } from "../lib/files.js";
import type { Command } from "./types.js";

export const recap: Command = {
  data: new SlashCommandBuilder()
    .setName("recap")
    .setDescription("Have Claude post a recap of the past 7 days in this channel right now.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!config.chatEnabled()) throw new UserError("Claude isn't set up on this bot (no ANTHROPIC_API_KEY).");
    if (!takeQuota(5)) throw new UserError("I've hit today's Claude limit. Try again tomorrow!");
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const ok = await postRecap(interaction.guild!, interaction.channel as GuildTextBasedChannel);
    await interaction.editReply(ok
      ? "Posted! To get one automatically every Sunday at 6 PM, use `/settings recap`."
      : "It's been too quiet this week for a recap.");
  },
};
