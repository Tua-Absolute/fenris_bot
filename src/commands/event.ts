import {
  ChannelType,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventStatus,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type GuildScheduledEventCreateOptions,
  type GuildTextBasedChannel,
} from "discord.js";
import { config } from "../config.js";
import { brandEmbed, colors, discordTime } from "../lib/brand.js";
import { download, isImage, UserError } from "../lib/files.js";
import { DATE_HELP, parseDateTime } from "../lib/time.js";
import type { Command } from "./types.js";

const HOUR = 60 * 60 * 1000;

export const event: Command = {
  data: new SlashCommandBuilder()
    .setName("event")
    .setDescription("Manage events on the server calendar.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
    .addSubcommand((s) => s.setName("create").setDescription("Create a calendar event.")
      .addStringOption((o) => o.setName("name").setDescription("Event name").setRequired(true).setMaxLength(100))
      .addStringOption((o) => o.setName("start").setDescription('When it starts, e.g. "fri 8pm" or "11/14 7:30pm"').setRequired(true))
      .addNumberOption((o) => o.setName("hours").setDescription("How long it runs (default 2)").setMinValue(0.25).setMaxValue(72))
      .addChannelOption((o) => o.setName("voice_channel").setDescription("Hold it in a voice or stage channel")
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice))
      .addStringOption((o) => o.setName("location").setDescription("Or a place / link, if not in a voice channel").setMaxLength(100))
      .addStringOption((o) => o.setName("description").setDescription("Details shown on the event").setMaxLength(1000))
      .addAttachmentOption((o) => o.setName("cover").setDescription("Cover image for the event"))
      .addChannelOption((o) => o.setName("announce_in").setDescription("Also post an announcement with the event link here")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand((s) => s.setName("list").setDescription("Show upcoming events."))
    .addSubcommand((s) => s.setName("cancel").setDescription("Cancel an event.")
      .addStringOption((o) => o.setName("event").setDescription("Which event").setRequired(true).setAutocomplete(true))),

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) throw new UserError("This only works inside a server.");
    const sub = interaction.options.getSubcommand();

    if (sub === "create") {
      const tz = config.timezone();
      const startText = interaction.options.getString("start", true);
      const start = parseDateTime(startText, tz);
      if (!start) throw new UserError(`I couldn't read "${startText}" as a date and time. ${DATE_HELP}`);
      if (start.getTime() < Date.now()) throw new UserError(`That time (${discordTime(start)}) is in the past.`);
      const end = new Date(start.getTime() + (interaction.options.getNumber("hours") ?? 2) * HOUR);

      const voice = interaction.options.getChannel("voice_channel");
      const cover = interaction.options.getAttachment("cover");
      if (cover && !isImage(cover)) throw new UserError("The cover needs to be an image file.");

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const options: GuildScheduledEventCreateOptions = {
        name: interaction.options.getString("name", true),
        description: interaction.options.getString("description") ?? undefined,
        scheduledStartTime: start,
        scheduledEndTime: end,
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        entityType: GuildScheduledEventEntityType.External,
        entityMetadata: { location: interaction.options.getString("location") ?? "See event details" },
        image: cover ? await download(cover) : undefined,
      };
      if (voice) {
        options.entityType = voice.type === ChannelType.GuildStageVoice
          ? GuildScheduledEventEntityType.StageInstance
          : GuildScheduledEventEntityType.Voice;
        options.channel = voice.id;
        delete options.entityMetadata;
      }

      let created;
      try {
        created = await guild.scheduledEvents.create(options);
      } catch (err) {
        console.error("event create failed:", err);
        throw new UserError("Discord wouldn't create that event. Make sure I have the Create Events permission (and can see the voice channel, if you picked one).");
      }

      const announceIn = interaction.options.getChannel("announce_in");
      if (announceIn) {
        const embed = brandEmbed(colors.red)
          .setTitle(`📅 ${created.name}`)
          .setURL(created.url)
          .setDescription([
            created.description,
            "",
            `**When:** ${discordTime(start)} (${discordTime(start, "R")})`,
            `**Where:** ${voice ? `<#${voice.id}>` : options.entityMetadata?.location}`,
            "",
            `[Click here and hit **Interested** to get a reminder](${created.url})`,
          ].filter((l) => l !== undefined && l !== null).join("\n"));
        const coverUrl = created.coverImageURL({ size: 1024 });
        if (coverUrl) embed.setImage(coverUrl);
        const ch = await guild.channels.fetch(announceIn.id);
        await (ch as GuildTextBasedChannel).send({ embeds: [embed] });
      }

      await interaction.editReply(
        `Created **${created.name}** for ${discordTime(start)}. ${created.url}` +
        (announceIn ? `\nAnnounced in <#${announceIn.id}>.` : ""));
      return;
    }

    if (sub === "list") {
      const events = [...(await guild.scheduledEvents.fetch()).values()]
        .filter((e) => e.status === GuildScheduledEventStatus.Scheduled || e.status === GuildScheduledEventStatus.Active)
        .sort((a, b) => (a.scheduledStartTimestamp ?? 0) - (b.scheduledStartTimestamp ?? 0));
      const embed = brandEmbed(colors.red).setTitle("Upcoming events");
      embed.setDescription(events.length
        ? events.slice(0, 15).map((e) => {
          const when = e.status === GuildScheduledEventStatus.Active ? "**Happening now**" : discordTime(e.scheduledStartAt!, "f") + ` (${discordTime(e.scheduledStartAt!, "R")})`;
          return `**[${e.name}](${e.url})**\n${when} · ${e.userCount ?? 0} interested`;
        }).join("\n\n")
        : "Nothing on the calendar yet. Create one with `/event create`.");
      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === "cancel") {
      const id = interaction.options.getString("event", true);
      const target = await guild.scheduledEvents.fetch(id).catch(() => null);
      if (!target) throw new UserError("I couldn't find that event. Pick one from the list as you type.");
      await target.delete();
      await interaction.reply({ content: `Cancelled **${target.name}**.`, flags: MessageFlags.Ephemeral });
    }
  },

  async autocomplete(interaction) {
    const typed = interaction.options.getFocused().toLowerCase();
    const events = await interaction.guild!.scheduledEvents.fetch();
    await interaction.respond(
      [...events.values()]
        .filter((e) => e.name.toLowerCase().includes(typed))
        .slice(0, 25)
        .map((e) => ({ name: e.name.slice(0, 100), value: e.id })),
    );
  },
};
