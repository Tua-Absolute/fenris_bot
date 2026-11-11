// Posts server activity (deleted and edited messages, joins, leaves, bans) to the mod log channel.
import { Events, type Client, type Message, type PartialMessage } from "discord.js";
import { brandEmbed, colors, discordTime } from "../lib/brand.js";
import { modLog } from "../lib/modlog.js";
import { getSettings } from "../lib/settings.js";

const clip = (text: string, max = 1000) => (text.length > max ? `${text.slice(0, max)}…` : text) || "*(no text)*";

function skip(m: Message | PartialMessage): boolean {
  return !m.guild || !!m.author?.bot || !getSettings(m.guild.id).modLogChannelId || m.channelId === getSettings(m.guild.id).modLogChannelId;
}

export function registerModLog(client: Client) {
  client.on(Events.MessageDelete, (m) => {
    if (skip(m)) return;
    const files = m.attachments?.size ? `\n**Attachments:** ${m.attachments.map((a) => a.name).join(", ")}` : "";
    void modLog(m.guild!, brandEmbed(colors.red).setTitle("🗑️ Message deleted").setDescription(
      `**Author:** ${m.author ? `<@${m.author.id}> (${m.author.tag})` : "unknown (sent before I started)"}\n**Channel:** <#${m.channelId}>${files}\n\n${clip(m.content ?? "*(not cached)*")}`));
  });

  client.on(Events.MessageBulkDelete, (messages, channel) => {
    const first = messages.first();
    if (!first || skip(first)) return;
    void modLog(channel.guild, brandEmbed(colors.red).setTitle("🗑️ Messages bulk deleted")
      .setDescription(`**Channel:** <#${channel.id}>\n**Count:** ${messages.size}`));
  });

  client.on(Events.MessageUpdate, (before, after) => {
    if (skip(after) || before.content === after.content || before.content == null) return;
    void modLog(after.guild!, brandEmbed(colors.gold).setTitle("✏️ Message edited").setURL(after.url).setDescription(
      `**Author:** <@${after.author!.id}>\n**Channel:** <#${after.channelId}> · [jump](${after.url})\n\n**Before:**\n${clip(before.content, 900)}\n\n**After:**\n${clip(after.content ?? "", 900)}`));
  });

  client.on(Events.GuildMemberAdd, (member) => {
    const age = Date.now() - member.user.createdTimestamp;
    const newAccount = age < 7 * 86_400_000 ? "\n⚠️ **New account** (under 7 days old)" : "";
    void modLog(member.guild, brandEmbed(colors.green).setTitle("📥 Member joined").setThumbnail(member.displayAvatarURL())
      .setDescription(`<@${member.id}> (${member.user.tag})\n**Account created:** ${discordTime(member.user.createdAt, "R")}${newAccount}\n**Members now:** ${member.guild.memberCount}`));
  });

  client.on(Events.GuildMemberRemove, (member) => {
    const roles = member.roles?.cache.filter((r) => r.id !== member.guild.id).map((r) => `<@&${r.id}>`).join(" ");
    void modLog(member.guild, brandEmbed(colors.white).setTitle("📤 Member left").setThumbnail(member.displayAvatarURL())
      .setDescription(`<@${member.id}> (${member.user?.tag ?? "unknown"})` +
        (member.joinedAt ? `\n**Joined:** ${discordTime(member.joinedAt, "R")}` : "") + (roles ? `\n**Roles:** ${roles}` : "")));
  });

  client.on(Events.GuildBanAdd, (ban) => {
    void modLog(ban.guild, brandEmbed(colors.red).setTitle("🔨 Member banned")
      .setDescription(`<@${ban.user.id}> (${ban.user.tag})${ban.reason ? `\n**Reason:** ${ban.reason}` : ""}`));
  });

  client.on(Events.GuildBanRemove, (ban) => {
    void modLog(ban.guild, brandEmbed(colors.green).setTitle("🕊️ Member unbanned").setDescription(`<@${ban.user.id}> (${ban.user.tag})`));
  });
}
