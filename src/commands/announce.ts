import {
  ActionRowBuilder,
  ChannelType,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type Attachment,
  type GuildTextBasedChannel,
} from "discord.js";
import { unlink } from "node:fs/promises";
import { config } from "../config.js";
import { buildAnnouncement, type AnnouncementData } from "../lib/announcement.js";
import { bannerStyleChoices } from "../lib/banner.js";
import { colorChoices, colorFor, discordTime } from "../lib/brand.js";
import { download, isImage, UserError } from "../lib/files.js";
import { dividerChoices, fontChoices } from "../lib/fonts.js";
import { addScheduled, saveImage } from "../lib/schedule.js";
import { DATE_HELP, parseDateTime, repeatChoices, repeatLabel, type Repeat } from "../lib/time.js";
import type { Command } from "./types.js";

interface Pending {
  data: Omit<AnnouncementData, "title" | "body" | "footer">;
  image: Attachment | null;
  postAt: Date | null;
  repeat?: Repeat;
  expires: number;
}

// Options picked on the slash command wait here while the person fills in the form.
const pending = new Map<string, Pending>();
const FIFTEEN_MINUTES = 15 * 60 * 1000;

// Discord allows at most 25 choices per option.
const fontOptions = fontChoices.slice(0, 25);

export const announce: Command = {
  data: new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Post (or schedule) a styled announcement. A form opens for the title and message.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addChannelOption((o) =>
      o.setName("channel").setDescription("Where to post it (default: this channel)")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addStringOption((o) => o.setName("when").setDescription('Schedule it, e.g. "fri 6pm" or "11/20 9am" (default: post now)'))
    .addStringOption((o) => o.setName("repeat").setDescription("Post it again on a cycle (needs `when` for the first post)").addChoices(...repeatChoices))
    .addStringOption((o) => o.setName("color").setDescription("Accent color").addChoices(...colorChoices))
    .addStringOption((o) => o.setName("title_font").setDescription("Fancy font for the title").addChoices(...fontOptions))
    .addStringOption((o) => o.setName("divider").setDescription("Emoji divider above and below the message").addChoices(...dividerChoices))
    .addAttachmentOption((o) => o.setName("image").setDescription("Your own banner image shown under the message"))
    .addStringOption((o) => o.setName("banner").setDescription("Or generate a banner from the title in this style").addChoices(...bannerStyleChoices))
    .addStringOption((o) =>
      o.setName("ping").setDescription("Who to notify").addChoices(
        { name: "Nobody", value: "none" },
        { name: "@here (online members)", value: "here" },
        { name: "@everyone", value: "everyone" },
      ))
    .addRoleOption((o) => o.setName("role").setDescription("Also ping this role"))
    .addStringOption((o) => o.setName("button_label").setDescription("Text for a link button, e.g. \"Sign up\"").setMaxLength(80))
    .addStringOption((o) => o.setName("button_url").setDescription("Where the link button goes (https://...)")),

  async execute(interaction) {
    const channel = interaction.options.getChannel("channel") ?? interaction.channel;
    const image = interaction.options.getAttachment("image");
    const buttonLabel = interaction.options.getString("button_label");
    const buttonUrl = interaction.options.getString("button_url");
    const whenText = interaction.options.getString("when");

    if (!channel) throw new UserError("I couldn't tell which channel to post in.");
    if (image && !isImage(image)) throw new UserError("The image option needs a picture file (PNG, JPG, GIF, or WebP).");
    if (buttonUrl && !/^https?:\/\/\S+$/i.test(buttonUrl)) throw new UserError("The button link has to start with https:// or http://.");
    if (!!buttonLabel !== !!buttonUrl) throw new UserError("A button needs both button_label and button_url.");

    let postAt: Date | null = null;
    const repeat = (interaction.options.getString("repeat") ?? undefined) as Repeat | undefined;
    if (repeat && !whenText) throw new UserError("To repeat an announcement, also set `when` for its first post.");
    if (whenText) {
      postAt = parseDateTime(whenText, config.timezone());
      if (!postAt) throw new UserError(`I couldn't read "${whenText}" as a date and time. ${DATE_HELP}`);
      if (postAt.getTime() < Date.now()) throw new UserError(`That time (${discordTime(postAt)}) is in the past.`);
    }

    const now = Date.now();
    for (const [key, p] of pending) if (p.expires < now) pending.delete(key);
    pending.set(interaction.id, {
      data: {
        channelId: channel.id,
        color: colorFor(interaction.options.getString("color")),
        ping: (interaction.options.getString("ping") ?? "none") as AnnouncementData["ping"],
        roleId: interaction.options.getRole("role")?.id,
        bannerStyle: interaction.options.getString("banner") ?? undefined,
        titleFont: interaction.options.getString("title_font") ?? undefined,
        divider: interaction.options.getString("divider") ?? undefined,
        buttonLabel: buttonLabel ?? undefined,
        buttonUrl: buttonUrl ?? undefined,
      },
      image,
      postAt,
      repeat,
      expires: now + FIFTEEN_MINUTES,
    });

    const modal = new ModalBuilder()
      .setCustomId(`announce:${interaction.id}`)
      .setTitle(postAt ? "Schedule an announcement" : "New announcement")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId("title").setLabel("Title").setStyle(TextInputStyle.Short)
            .setMaxLength(200).setRequired(true).setPlaceholder("Game Night This Friday!")),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId("body").setLabel("Message").setStyle(TextInputStyle.Paragraph)
            .setMaxLength(3800).setRequired(true)
            .setPlaceholder("Supports **bold**, # headings, lists, links, emoji, and your server's :custom_emoji:")),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId("footer").setLabel("Footer (optional)").setStyle(TextInputStyle.Short)
            .setMaxLength(200).setRequired(false).setPlaceholder("Questions? Ask a mod.")),
      );
    await interaction.showModal(modal);
  },

  async handleModal(interaction) {
    const key = interaction.customId.split(":")[1];
    const p = pending.get(key);
    pending.delete(key);
    if (!p) throw new UserError("That form expired. Run /announce again.");
    const guild = interaction.guild;
    if (!guild) throw new UserError("This only works inside a server.");

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const data: AnnouncementData = {
      ...p.data,
      title: interaction.fields.getTextInputValue("title"),
      body: interaction.fields.getTextInputValue("body"),
      footer: interaction.fields.getTextInputValue("footer") || undefined,
    };
    if (p.image) {
      // Uploaded image links expire, so keep our own copy.
      data.imageFile = await saveImage(await download(p.image), p.image.name.split(".").pop() ?? "png");
    }

    if (p.postAt) {
      const item = await addScheduled(guild.id, interaction.user.id, p.postAt, data, p.repeat);
      const { embed } = await buildAnnouncement(guild, { ...data, bannerStyle: undefined, imageFile: undefined });
      await interaction.editReply({
        content: `Scheduled for ${discordTime(p.postAt)} (${discordTime(p.postAt, "R")})${p.repeat ? `, then ${repeatLabel(p.repeat)}` : ""} in <#${data.channelId}>. ` +
          `ID \`${item.id}\`. See or cancel it with \`/schedule\`. Preview:`,
        embeds: [embed],
      });
      return;
    }

    const channel = await guild.channels.fetch(data.channelId);
    if (!channel?.isTextBased()) throw new UserError("I can't post in that channel.");
    const { message } = await buildAnnouncement(guild, data);
    let sent;
    try {
      sent = await (channel as GuildTextBasedChannel).send(message);
    } catch (err) {
      console.error("announce send failed:", err);
      throw new UserError(`I couldn't post in <#${channel.id}>. Check that I can view, send messages, embed links, and attach files there.`);
    } finally {
      if (data.imageFile) await unlink(data.imageFile).catch(() => {});
    }
    await interaction.editReply(`Posted in <#${channel.id}>: ${sent.url}`);
  },
};
