import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { brandEmbed, colors, discordTime } from "../lib/brand.js";
import { UserError } from "../lib/files.js";
import { targetMember } from "../lib/modcheck.js";
import { formatDuration, modLog, parseDuration } from "../lib/modlog.js";
import type { Command } from "./types.js";

const MAX = 28 * 86_400_000; // Discord's limit

export const timeout: Command = {
  data: new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Mute a member for a while, or lift a timeout.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((s) => s.setName("set").setDescription("Time a member out.")
      .addUserOption((o) => o.setName("user").setDescription("Who").setRequired(true))
      .addStringOption((o) => o.setName("duration").setDescription("e.g. 10m, 1h, 1d, 1h30m (max 28d)").setRequired(true))
      .addStringOption((o) => o.setName("reason").setDescription("Why").setMaxLength(500)))
    .addSubcommand((s) => s.setName("remove").setDescription("Lift a timeout early.")
      .addUserOption((o) => o.setName("user").setDescription("Who").setRequired(true))),

  async execute(interaction) {
    const guild = interaction.guild!;
    const member = await targetMember(interaction);
    if (!member.moderatable) throw new UserError("I can't time them out. Drag my role above theirs in Server Settings > Roles.");

    if (interaction.options.getSubcommand() === "remove") {
      if (!member.isCommunicationDisabled()) throw new UserError("They aren't timed out.");
      await member.timeout(null, `Lifted by ${interaction.user.tag}`);
      await interaction.reply({ embeds: [brandEmbed(colors.green).setDescription(`🔊 Lifted the timeout on <@${member.id}>.`)], allowedMentions: { parse: [] } });
      await modLog(guild, brandEmbed(colors.green).setTitle("🔊 Timeout lifted").setDescription(`**Member:** <@${member.id}>\n**By:** <@${interaction.user.id}>`));
      return;
    }

    const ms = parseDuration(interaction.options.getString("duration", true));
    if (!ms) throw new UserError("I couldn't read that duration. Try `10m`, `2h`, `1d`, or `1h30m`.");
    if (ms > MAX) throw new UserError("Discord allows timeouts of up to 28 days.");
    const reason = interaction.options.getString("reason") ?? "No reason given";
    await member.timeout(ms, `${reason} (by ${interaction.user.tag})`);
    const until = new Date(Date.now() + ms);
    await interaction.reply({
      embeds: [brandEmbed(colors.ember).setDescription(`🔇 Timed out <@${member.id}> for **${formatDuration(ms)}** (until ${discordTime(until, "t")}).\n**Reason:** ${reason}`)],
      allowedMentions: { parse: [] },
    });
    await modLog(guild, brandEmbed(colors.ember).setTitle("🔇 Timeout")
      .setDescription(`**Member:** <@${member.id}> (${member.user.tag})\n**By:** <@${interaction.user.id}>\n**Length:** ${formatDuration(ms)}, until ${discordTime(until)}\n**Reason:** ${reason}`));
  },
};
