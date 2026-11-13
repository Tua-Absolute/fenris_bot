import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type GuildTextBasedChannel } from "discord.js";
import { config } from "../config.js";
import { FREQUENCY_TITLE, isDue, postQuote } from "../features/quotes.js";
import { UserError } from "../lib/files.js";
import { addQuote, BUILT_IN, customQuotes, removeQuote } from "../lib/quotes.js";
import { getSettings, updateSettings, type GuildSettings } from "../lib/settings.js";
import { partsInZone } from "../lib/time.js";
import type { Command } from "./types.js";

type QuoteSettings = NonNullable<GuildSettings["quotes"]>;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hourLabel = (h: number) => h === 0 ? "12 AM (midnight)" : h === 12 ? "12 PM (noon)" : h < 12 ? `${h} AM` : `${h - 12} PM`;
const HOUR_CHOICES = Array.from({ length: 24 }, (_, h) => ({ name: hourLabel(h), value: h }));
const ordinal = (n: number) => n + (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th");

function describe(q: QuoteSettings): string {
  const at = `at **${hourLabel(q.hour)}**`;
  const when = {
    daily: `every day ${at}`,
    weekly: `every **${WEEKDAYS[q.weekday]}** ${at}`,
    biweekly: `every other **${WEEKDAYS[q.weekday]}** ${at}`,
    monthly: `on the **${ordinal(q.monthDay)}** of every month ${at}`,
  }[q.frequency];
  return `in <#${q.channelId}> ${when} (${config.timezone()})`;
}

export const quotes: Command = {
  data: new SlashCommandBuilder()
    .setName("quotes")
    .setDescription("Post an inspirational quote on a schedule.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName("setup").setDescription("Choose where and how often Fenris posts a quote.")
      .addChannelOption((o) => o.setName("channel").setDescription("Where to post (like your announcements channel)").setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addStringOption((o) => o.setName("frequency").setDescription("How often").setRequired(true).addChoices(
        { name: "Daily", value: "daily" },
        { name: "Weekly", value: "weekly" },
        { name: "Every 2 weeks", value: "biweekly" },
        { name: "Monthly", value: "monthly" }))
      .addIntegerOption((o) => o.setName("hour").setDescription("Hour of the day to post (default: 9 AM)").addChoices(...HOUR_CHOICES))
      .addStringOption((o) => o.setName("weekday").setDescription("Weekly / every 2 weeks: which day (default: Monday)")
        .addChoices(...WEEKDAYS.map((name, i) => ({ name, value: String(i) }))))
      .addIntegerOption((o) => o.setName("day_of_month").setDescription("Monthly: which day (default: the 1st; 31 means the last day)").setMinValue(1).setMaxValue(31))
      .addStringOption((o) => o.setName("source").setDescription("Which quotes to use (default: built-in plus yours)").addChoices(
        { name: "Built-in quotes plus your own", value: "all" },
        { name: "Only quotes you added", value: "custom" })))
    .addSubcommand((s) => s.setName("now").setDescription("Post a quote right now."))
    .addSubcommand((s) => s.setName("add").setDescription("Add your own quote to the mix.")
      .addStringOption((o) => o.setName("text").setDescription("The quote").setRequired(true).setMaxLength(1000))
      .addStringOption((o) => o.setName("author").setDescription("Who said it (optional)").setMaxLength(100)))
    .addSubcommand((s) => s.setName("remove").setDescription("Remove one of the quotes you added.")
      .addStringOption((o) => o.setName("quote").setDescription("Start typing to find it").setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) => s.setName("status").setDescription("Show the quote schedule."))
    .addSubcommand((s) => s.setName("off").setDescription("Stop posting quotes (your added quotes are kept).")),

  async autocomplete(interaction) {
    const typed = interaction.options.getFocused().toLowerCase();
    const list = customQuotes(interaction.guildId!)
      .map((q, i) => ({ name: `${q.text} — ${q.author}`.slice(0, 100), value: String(i) }))
      .filter((c) => c.name.toLowerCase().includes(typed));
    await interaction.respond(list.slice(0, 25));
  },

  async execute(interaction) {
    const guild = interaction.guild!;
    const sub = interaction.options.getSubcommand();
    const current = getSettings(guild.id).quotes;
    const reply = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

    if (sub === "setup") {
      const channel = interaction.options.getChannel("channel", true) as GuildTextBasedChannel;
      const me = await guild.members.fetchMe();
      if (!channel.permissionsFor(me)?.has(["ViewChannel", "SendMessages", "EmbedLinks"])) {
        throw new UserError(`I can't post in <#${channel.id}>. Give my role **View Channel**, **Send Messages**, and **Embed Links** there.`);
      }
      const source = interaction.options.getString("source");
      if (source === "custom" && !customQuotes(guild.id).length) throw new UserError("You haven't added any quotes yet. Use `/quotes add` first, or pick the built-in quotes.");
      const q: QuoteSettings = {
        channelId: channel.id,
        frequency: interaction.options.getString("frequency", true) as QuoteSettings["frequency"],
        hour: interaction.options.getInteger("hour") ?? current?.hour ?? 9,
        weekday: Number(interaction.options.getString("weekday") ?? current?.weekday ?? 1),
        monthDay: interaction.options.getInteger("day_of_month") ?? current?.monthDay ?? 1,
        customOnly: source ? source === "custom" : current?.customOnly,
      };
      // If today's slot has already passed, don't fire one the moment it's set up; start with the next one.
      const now = new Date();
      if (isDue(q, now, config.timezone())) {
        const p = partsInZone(now, config.timezone());
        q.lastPosted = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
      }
      await updateSettings(guild.id, { quotes: q });
      await reply(`💭 Quotes will be posted ${describe(q)}.\nWant one right away? Use \`/quotes now\`.`);
      return;
    }

    if (sub === "now") {
      const id = current?.channelId ?? interaction.channelId;
      const channel = guild.channels.cache.get(id);
      if (!channel?.isTextBased()) throw new UserError("I can't find the quotes channel. Run `/quotes setup` again.");
      await postQuote(guild, channel as GuildTextBasedChannel, current ? FREQUENCY_TITLE[current.frequency] : "Quote of the Day", current?.customOnly);
      await reply(`Posted in <#${channel.id}>!`);
      return;
    }

    if (sub === "add") {
      const text = interaction.options.getString("text", true).trim().replace(/^["“]|["”]$/g, "");
      const author = interaction.options.getString("author")?.trim() || "Unknown";
      await addQuote(guild.id, { text, author });
      await reply(`Added! Your server now has **${customQuotes(guild.id).length}** quote(s) of its own, on top of ${BUILT_IN.length} built-in ones.`);
      return;
    }

    if (sub === "remove") {
      const index = Number(interaction.options.getString("quote", true));
      const removed = Number.isInteger(index) ? await removeQuote(guild.id, index) : undefined;
      if (!removed) throw new UserError("I couldn't find that quote. Pick one from the list as you type.");
      await reply(`Removed: *${removed.text}* — ${removed.author}`);
      return;
    }

    if (sub === "status") {
      const own = customQuotes(guild.id).length;
      await reply((current ? `💭 Quotes are posted ${describe(current)}${current.customOnly ? ", using only your own quotes" : ""}.` : "Quotes are off. Use `/quotes setup` to start.") +
        `\nQuotes available: ${BUILT_IN.length} built-in + ${own} of your own. Each one is used once before any repeat.`);
      return;
    }

    await updateSettings(guild.id, { quotes: undefined });
    await reply("Quotes are off. Your added quotes are kept for next time.");
  },
};
