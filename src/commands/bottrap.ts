import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type GuildTextBasedChannel } from "discord.js";
import { brandEmbed, colors } from "../lib/brand.js";
import { UserError } from "../lib/files.js";
import { getSettings, updateSettings } from "../lib/settings.js";
import type { Command } from "./types.js";

const BAIT = "✅";

export const bottrap: Command = {
  data: new SlashCommandBuilder()
    .setName("bottrap")
    .setDescription("Catch spam bots: anyone who reacts to the trap post or writes in its channel is removed.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName("setup").setDescription("Post the trap in a channel (best: a new channel just for it).")
      .addChannelOption((o) => o.setName("channel").setDescription("Trap channel. Everyone who posts here is caught, so use a dedicated one.")
        .setRequired(true).addChannelTypes(ChannelType.GuildText))
      .addStringOption((o) => o.setName("action").setDescription("What happens to anyone caught (default: ban)").addChoices(
        { name: "Ban (and delete their last 24 h of messages)", value: "ban" },
        { name: "Kick", value: "kick" },
        { name: "Timeout for 7 days", value: "timeout" })))
    .addSubcommand((s) => s.setName("status").setDescription("Show the current trap."))
    .addSubcommand((s) => s.setName("off").setDescription("Turn the trap off (the post is deleted).")),

  async execute(interaction) {
    const guild = interaction.guild!;
    const sub = interaction.options.getSubcommand();
    const current = getSettings(guild.id).botTrap;

    if (sub === "status") {
      await interaction.reply({
        content: current
          ? `🪤 The trap is set in <#${current.channelId}> ([post](https://discord.com/channels/${guild.id}/${current.channelId}/${current.messageId})). Action: **${current.action}**. Catches are logged in the mod log.`
          : "No trap set. Use `/bottrap setup`.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (current) {
      const old = guild.channels.cache.get(current.channelId);
      if (old?.isTextBased()) await old.messages.delete(current.messageId).catch(() => {});
    }
    if (sub === "off") {
      await updateSettings(guild.id, { botTrap: undefined });
      await interaction.reply({ content: "Bot catcher is off.", flags: MessageFlags.Ephemeral });
      return;
    }

    const channel = interaction.options.getChannel("channel", true) as GuildTextBasedChannel;
    const action = (interaction.options.getString("action") ?? "ban") as "ban" | "kick" | "timeout";
    const me = await guild.members.fetchMe();
    const need = { ban: PermissionFlagsBits.BanMembers, kick: PermissionFlagsBits.KickMembers, timeout: PermissionFlagsBits.ModerateMembers }[action];
    if (!me.permissions.has(need)) throw new UserError(`I need the **${action === "timeout" ? "Timeout Members" : action === "ban" ? "Ban Members" : "Kick Members"}** permission for that. Turn it on for my role in Server Settings > Roles.`);

    const msg = await channel.send({ embeds: [brandEmbed(colors.red)
      .setTitle("⚠️ DO NOT REACT OR TYPE HERE ⚠️")
      .setDescription("This channel is a **trap for spam bots**.\n\n" +
        `Anyone who reacts to this message or sends a message in this channel will be **${action === "ban" ? "banned" : action === "kick" ? "kicked" : "timed out"} automatically**.\n\n` +
        "If you're a real person, please just ignore this channel. 🐺")] });
    await msg.react(BAIT).catch(() => {});
    await updateSettings(guild.id, { botTrap: { channelId: channel.id, messageId: msg.id, action } });
    await interaction.reply({
      content: `🪤 Trap set in <#${channel.id}>. Anyone except staff (Manage Messages) and real bots who reacts or posts there will be **${action}ed**, and it's logged in the mod log.\n` +
        "Tip: keep the channel visible to everyone, put it near the top, and don't let members mute it.",
      flags: MessageFlags.Ephemeral,
    });
  },
};
