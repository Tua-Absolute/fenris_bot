import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type GuildTextBasedChannel } from "discord.js";
import { UserError } from "../lib/files.js";
import { getSettings, updateSettings, type GuildSettings } from "../lib/settings.js";
import type { Command } from "./types.js";

type Rule = NonNullable<GuildSettings["autoThreads"]>[string];
const ARCHIVE: Record<number, string> = { 60: "1 hour", 1440: "1 day", 4320: "3 days", 10080: "1 week" };

const describe = (id: string, r: Rule) =>
  `▸ <#${id}>: a thread on **${r.imagesOnly ? "every screenshot or image" : "every post"}**, named \`${r.name ?? "their message (or \"Name's screenshot\")"}\`, hidden after **${ARCHIVE[r.archiveMinutes]}** of quiet`;

export const autothread: Command = {
  data: new SlashCommandBuilder()
    .setName("autothread")
    .setDescription("Automatically open a thread when people post screenshots in a channel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((s) => s.setName("add").setDescription("Turn on auto-threads in a channel (run again to change its settings).")
      .addChannelOption((o) => o.setName("channel").setDescription("Which channel").setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addStringOption((o) => o.setName("posts").setDescription("Which posts get a thread (default: screenshots and images)").addChoices(
        { name: "Screenshots and images only", value: "images" },
        { name: "Every post", value: "all" }))
      .addStringOption((o) => o.setName("thread_name").setDescription("Name for each thread. Use {name}, {text}, {date}. Default: their message, or \"Name's screenshot\"").setMaxLength(100))
      .addIntegerOption((o) => o.setName("hide_after").setDescription("Hide the thread after this long with no messages (default: 1 day)").addChoices(
        ...Object.entries(ARCHIVE).map(([value, name]) => ({ name, value: Number(value) })))))
    .addSubcommand((s) => s.setName("remove").setDescription("Turn off auto-threads in a channel.")
      .addChannelOption((o) => o.setName("channel").setDescription("Which channel").setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand((s) => s.setName("list").setDescription("Show channels with auto-threads.")),

  async execute(interaction) {
    const guild = interaction.guild!;
    const sub = interaction.options.getSubcommand();
    const rules = { ...(getSettings(guild.id).autoThreads ?? {}) };
    const reply = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

    if (sub === "list") {
      const lines = Object.entries(rules).map(([id, r]) => describe(id, r));
      await reply(lines.length ? `🧵 **Auto-threads**\n${lines.join("\n")}` : "No auto-thread channels yet. Use `/autothread add`.");
      return;
    }

    const channel = interaction.options.getChannel("channel", true) as GuildTextBasedChannel;
    if (sub === "remove") {
      if (!rules[channel.id]) throw new UserError(`Auto-threads aren't on in <#${channel.id}>.`);
      delete rules[channel.id];
      await updateSettings(guild.id, { autoThreads: Object.keys(rules).length ? rules : undefined });
      await reply(`Auto-threads are off in <#${channel.id}>.`);
      return;
    }

    const me = await guild.members.fetchMe();
    const missing = (["ViewChannel", "CreatePublicThreads", "SendMessagesInThreads"] as const).filter((p) => !channel.permissionsFor(me)?.has(p));
    if (missing.length) {
      const names = { ViewChannel: "View Channel", CreatePublicThreads: "Create Public Threads", SendMessagesInThreads: "Send Messages in Threads" };
      throw new UserError(`I need **${missing.map((m) => names[m]).join("**, **")}** in <#${channel.id}>. Turn it on for my role in Server Settings > Roles (or in that channel's permissions).`);
    }
    const rule: Rule = {
      imagesOnly: (interaction.options.getString("posts") ?? "images") === "images",
      name: interaction.options.getString("thread_name")?.trim() || undefined,
      archiveMinutes: (interaction.options.getInteger("hide_after") ?? 1440) as Rule["archiveMinutes"],
    };
    rules[channel.id] = rule;
    await updateSettings(guild.id, { autoThreads: rules });
    await reply(`🧵 Auto-threads are on!\n${describe(channel.id, rule)}`);
  },
};
