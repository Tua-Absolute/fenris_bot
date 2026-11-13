import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type GuildTextBasedChannel } from "discord.js";
import { config } from "../config.js";
import { announceBirthday, DEFAULT_BIRTHDAY } from "../features/birthdays.js";
import { allBirthdays, daysUntil, formatBirthday, getBirthday, monthChoices, removeBirthday, setBirthday, validDate } from "../lib/birthdays.js";
import { brandEmbed, colors } from "../lib/brand.js";
import { UserError } from "../lib/files.js";
import { getSettings, updateSettings } from "../lib/settings.js";
import { partsInZone } from "../lib/time.js";
import type { Command } from "./types.js";

const isAdmin = (i: { memberPermissions: { has(p: bigint): boolean } | null }) => !!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild);

export const birthday: Command = {
  data: new SlashCommandBuilder()
    .setName("birthday")
    .setDescription("Birthday registry: Fenris announces birthdays on the day.")
    .addSubcommand((s) => s.setName("set").setDescription("Add or change your birthday.")
      .addIntegerOption((o) => o.setName("month").setDescription("Month").setRequired(true).addChoices(...monthChoices))
      .addIntegerOption((o) => o.setName("day").setDescription("Day of the month").setRequired(true).setMinValue(1).setMaxValue(31))
      .addUserOption((o) => o.setName("user").setDescription("Set someone else's birthday (admins only)")))
    .addSubcommand((s) => s.setName("remove").setDescription("Remove your birthday.")
      .addUserOption((o) => o.setName("user").setDescription("Remove someone else's (admins only)")))
    .addSubcommand((s) => s.setName("view").setDescription("See someone's birthday.")
      .addUserOption((o) => o.setName("user").setDescription("Whose birthday (default: yours)")))
    .addSubcommand((s) => s.setName("upcoming").setDescription("Birthdays coming up in the next 30 days."))
    .addSubcommand((s) => s.setName("setup").setDescription("Where and how birthdays are announced (admins).")
      .addChannelOption((o) => o.setName("channel").setDescription("Announcement channel (leave empty to turn announcements off)").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addRoleOption((o) => o.setName("role").setDescription("Give this role for the day (e.g. 🎂 Birthday)"))
      .addStringOption((o) => o.setName("message").setDescription("Use {user}, {name}, {server}").setMaxLength(500)))
    .addSubcommand((s) => s.setName("test").setDescription("Preview the birthday post for yourself in this channel (admins).")),

  async execute(interaction) {
    const guild = interaction.guild!;
    const sub = interaction.options.getSubcommand();
    const other = interaction.options.getUser("user");
    if (other && other.id !== interaction.user.id && !isAdmin(interaction)) throw new UserError("Only admins can change someone else's birthday.");
    const target = other ?? interaction.user;
    const self = target.id === interaction.user.id;

    if (sub === "set") {
      const month = interaction.options.getInteger("month", true);
      const day = interaction.options.getInteger("day", true);
      if (!validDate(month, day)) throw new UserError("That date doesn't exist. Check the month and day.");
      await setBirthday(guild.id, target.id, { month, day });
      const announcing = getSettings(guild.id).birthdayChannelId;
      await interaction.reply({
        content: `🎂 Saved ${self ? "your" : `<@${target.id}>'s`} birthday as **${formatBirthday({ month, day })}**.` +
          (announcing ? ` I'll celebrate in <#${announcing}> on the day!` : " (An admin still needs to pick a channel with `/birthday setup`.)"),
        flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] },
      });
      return;
    }
    if (sub === "remove") {
      const removed = await removeBirthday(guild.id, target.id);
      await interaction.reply({ content: removed ? "Birthday removed." : "No birthday was saved.", flags: MessageFlags.Ephemeral });
      return;
    }
    if (sub === "view") {
      const b = getBirthday(guild.id, target.id);
      await interaction.reply({
        content: b ? `🎂 ${self ? "Your" : `<@${target.id}>'s`} birthday is **${formatBirthday(b)}**.` : `${self ? "You haven't" : "They haven't"} added a birthday yet. Use \`/birthday set\`.`,
        flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] },
      });
      return;
    }
    if (sub === "upcoming") {
      const p = partsInZone(new Date(), config.timezone());
      const list = allBirthdays(guild.id)
        .map(([id, b]) => ({ id, b, days: daysUntil(b, p.year, p.month, p.day) }))
        .filter((x) => x.days <= 30 && guild.members.cache.has(x.id)).sort((a, b) => a.days - b.days).slice(0, 20);
      await interaction.reply({
        embeds: [brandEmbed(colors.ember).setTitle("🎂 Upcoming birthdays").setDescription(list.length
          ? list.map((x) => `**${formatBirthday(x.b)}** · <@${x.id}>${x.days === 0 ? " · 🎉 today!" : x.days === 1 ? " · tomorrow" : ` · in ${x.days} days`}`).join("\n")
          : "No birthdays in the next 30 days. Add yours with `/birthday set`!")],
        allowedMentions: { parse: [] },
      });
      return;
    }

    if (!isAdmin(interaction)) throw new UserError("That needs Manage Server.");
    if (sub === "setup") {
      const ch = interaction.options.getChannel("channel");
      const role = interaction.options.getRole("role");
      const message = interaction.options.getString("message");
      await updateSettings(guild.id, {
        birthdayChannelId: ch?.id, birthdayRoleId: role?.id ?? getSettings(guild.id).birthdayRoleId,
        birthdayMessage: message ?? getSettings(guild.id).birthdayMessage,
      });
      const s = getSettings(guild.id);
      await interaction.reply({
        content: s.birthdayChannelId
          ? `🎂 Birthdays will be announced in <#${s.birthdayChannelId}> at 9 AM on the day${s.birthdayRoleId ? `, with <@&${s.birthdayRoleId}> for the day` : ""}.\nMessage: ${s.birthdayMessage ?? DEFAULT_BIRTHDAY}\nTry \`/birthday test\` to preview it.`
          : "Birthday announcements are off.",
        flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] },
      });
      return;
    }
    // test
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const member = await guild.members.fetch(interaction.user.id);
    await announceBirthday(guild, member, interaction.channel as GuildTextBasedChannel);
    await interaction.editReply("That's what birthday posts look like.");
  },
};
