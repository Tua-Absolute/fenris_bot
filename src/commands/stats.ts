import { ChannelType, GuildPremiumTier, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type Client, type Guild } from "discord.js";
import { activity } from "../lib/activity.js";
import { brandEmbed, colors, discordTime } from "../lib/brand.js";
import { UserError } from "../lib/files.js";
import { getSettings, updateSettings } from "../lib/settings.js";
import type { Command } from "./types.js";

const counterName = (guild: Guild) => `👥 Members: ${guild.memberCount.toLocaleString()}`;

// Discord lets bots rename a channel only twice per 10 minutes, so batch updates.
const pendingRename = new Set<string>();
function refreshCounter(guild: Guild) {
  const id = getSettings(guild.id).memberCountChannelId;
  if (!id || pendingRename.has(guild.id)) return;
  pendingRename.add(guild.id);
  setTimeout(async () => {
    pendingRename.delete(guild.id);
    const ch = guild.channels.cache.get(id);
    if (ch && ch.name !== counterName(guild)) await ch.setName(counterName(guild)).catch((e) => console.error("Member counter rename failed:", e.message));
  }, 5 * 60_000);
}

export function registerMemberCounter(client: Client) {
  client.on("guildMemberAdd", (m) => refreshCounter(m.guild));
  client.on("guildMemberRemove", (m) => refreshCounter(m.guild));
}

export const stats: Command = {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Server statistics.")
    .addSubcommand((s) => s.setName("show").setDescription("Members, activity, busiest channels, and more."))
    .addSubcommand((s) => s.setName("counter").setDescription("Add or remove a live \"Members: N\" channel at the top of the server (admins).")
      .addBooleanOption((o) => o.setName("on").setDescription("Turn the counter on or off").setRequired(true))),

  async execute(interaction) {
    const guild = interaction.guild!;
    if (interaction.options.getSubcommand() === "counter") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) throw new UserError("That needs Manage Server.");
      const existing = getSettings(guild.id).memberCountChannelId;
      if (!interaction.options.getBoolean("on", true)) {
        if (existing) await guild.channels.cache.get(existing)?.delete("Member counter turned off").catch(() => {});
        await updateSettings(guild.id, { memberCountChannelId: undefined });
        await interaction.reply({ content: "Member counter removed.", flags: MessageFlags.Ephemeral });
        return;
      }
      if (existing && guild.channels.cache.has(existing)) throw new UserError(`The counter is already on: <#${existing}>`);
      const ch = await guild.channels.create({
        name: counterName(guild), type: ChannelType.GuildVoice, position: 0,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect], allow: [PermissionFlagsBits.ViewChannel] },
          { id: guild.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels] },
        ],
      });
      await updateSettings(guild.id, { memberCountChannelId: ch.id });
      await interaction.reply({ content: `Added <#${ch.id}>. It updates within a few minutes of anyone joining or leaving.`, flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply();
    const members = await guild.members.fetch();
    const bots = members.filter((m) => m.user.bot).size;
    const weekAgo = Date.now() - 7 * 86_400_000;
    const newThisWeek = members.filter((m) => !m.user.bot && (m.joinedTimestamp ?? 0) > weekAgo).size;
    const a = activity(guild.id);
    const channels = guild.channels.cache;
    const text = channels.filter((c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement).size;
    const voice = channels.filter((c) => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice).size;
    const events = guild.scheduledEvents.cache.size;
    const tier = ["None", "Level 1", "Level 2", "Level 3"][guild.premiumTier ?? GuildPremiumTier.None];

    await interaction.editReply({ embeds: [brandEmbed(colors.red).setTitle(`📊 ${guild.name}`).setThumbnail(guild.iconURL())
      .addFields(
        { name: "Members", value: `👥 ${(members.size - bots).toLocaleString()} people\n🤖 ${bots} bots\n🆕 ${newThisWeek} joined this week`, inline: true },
        { name: "Messages", value: `Today: ${a.today.toLocaleString()}\nThis week: ${a.week.toLocaleString()}\n30 days: ${a.month.toLocaleString()}`, inline: true },
        { name: "Server", value: `💬 ${text} text · 🔊 ${voice} voice\n🎭 ${guild.roles.cache.size - 1} roles\n📅 ${events} upcoming events`, inline: true },
        { name: "Busiest channels (7 days)", value: a.topChannels.length ? a.topChannels.map(([id, n], i) => `${i + 1}. <#${id}> · ${n}`).join("\n") : "Counting starts now. Check back soon!", inline: true },
        { name: "Boosts", value: `💎 ${guild.premiumSubscriptionCount ?? 0} (${tier})`, inline: true },
        { name: "Created", value: `${discordTime(guild.createdAt, "D")}\n${discordTime(guild.createdAt, "R")}`, inline: true },
      )] });
  },
};
