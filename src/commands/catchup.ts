import { ChannelType, MessageFlags, SlashCommandBuilder, type GuildTextBasedChannel } from "discord.js";
import { config } from "../config.js";
import { writeWithClaude } from "../ai/claude.js";
import { takeQuota } from "../ai/quota.js";
import { messagesSince, transcript } from "../ai/transcript.js";
import { brandEmbed, colors, discordTime } from "../lib/brand.js";
import { UserError } from "../lib/files.js";
import type { Command } from "./types.js";

const SYSTEM = `You are Fenris, a Discord server's bot. Summarize the channel messages you're given for someone catching up.
Write 3 to 8 short bullets in Discord markdown: the main topics, decisions, plans with dates, questions still open, and anything that mentions or needs the reader (call that out first with 👉).
Use people's names. Skip greetings and small talk. Don't invent anything. Under 1500 characters.`;

export const catchup: Command = {
  data: new SlashCommandBuilder()
    .setName("catchup")
    .setDescription("Claude privately sums up what you missed in a channel.")
    .addIntegerOption((o) => o.setName("hours").setDescription("How far back to look (default: since your last message, up to 24 h)").setMinValue(1).setMaxValue(168))
    .addChannelOption((o) => o.setName("channel").setDescription("Which channel (default: this one)").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),

  async execute(interaction) {
    if (!config.chatEnabled()) throw new UserError("Claude isn't set up on this bot (no ANTHROPIC_API_KEY).");
    const channel = (interaction.options.getChannel("channel") ?? interaction.channel) as GuildTextBasedChannel | null;
    if (!channel?.isTextBased()) throw new UserError("I can't read that channel.");
    if (!channel.permissionsFor(interaction.user.id)?.has("ViewChannel")) throw new UserError("You can't see that channel.");
    if (!takeQuota()) throw new UserError("I've hit today's Claude limit. Try again tomorrow!");
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const hours = interaction.options.getInteger("hours");
    let since = Date.now() - (hours ?? 24) * 3_600_000;
    let messages = await messagesSince(channel, since);
    if (!hours) {
      // Start after the reader's own last message, if they wrote in the window.
      const mine = messages.map((m) => m.author.id).lastIndexOf(interaction.user.id);
      if (mine >= 0) { since = messages[mine].createdTimestamp; messages = messages.slice(mine + 1); }
    }
    if (messages.length < 2) {
      await interaction.editReply(`Not much to catch up on in <#${channel.id}>: ${messages.length ? "just one message" : "no messages"} since ${discordTime(new Date(since), "R")}.`);
      return;
    }

    const reader = interaction.member && "displayName" in interaction.member ? interaction.member.displayName : interaction.user.username;
    const summary = await writeWithClaude(SYSTEM,
      `Reader: ${reader}\nChannel: #${channel.name}\n\nMessages (oldest first):\n${transcript(messages, interaction.client.user.id).slice(-60_000)}`, 1500);
    await interaction.editReply({ embeds: [brandEmbed(colors.red)
      .setTitle(`🐺 Catch-up: #${channel.name}`)
      .setDescription(summary.slice(0, 4000) || "I couldn't summarize that one.")
      .setFooter({ text: `${messages.length} messages since then` })] });
  },
};
