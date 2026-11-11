import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type Attachment,
  type GuildTextBasedChannel,
  type MessageCreateOptions,
} from "discord.js";
import { brandEmbed, colorChoices, colorFor } from "../lib/brand.js";
import { bannerStyleChoices, renderBanner } from "../lib/banner.js";
import { download, isImage, UserError } from "../lib/files.js";
import type { Command } from "./types.js";

interface Pending {
  channelId: string;
  color: number;
  ping: string;
  roleId: string | null;
  image: Attachment | null;
  bannerStyle: string | null;
  buttonLabel: string | null;
  buttonUrl: string | null;
  expires: number;
}

// Options picked on the slash command wait here while the person fills in the modal.
const pending = new Map<string, Pending>();
const FIFTEEN_MINUTES = 15 * 60 * 1000;

export const announce: Command = {
  data: new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Post a styled announcement. A form opens for the title and message.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addChannelOption((o) =>
      o.setName("channel").setDescription("Where to post it (default: this channel)")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addStringOption((o) =>
      o.setName("color").setDescription("Accent color").addChoices(...colorChoices))
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

    if (!channel) throw new UserError("I couldn't tell which channel to post in.");
    if (image && !isImage(image)) throw new UserError("The image option needs a picture file (PNG, JPG, GIF, or WebP).");
    if (buttonUrl && !/^https?:\/\/\S+$/i.test(buttonUrl)) throw new UserError("The button link has to start with https:// or http://.");
    if (!!buttonLabel !== !!buttonUrl) throw new UserError("A button needs both button_label and button_url.");

    const now = Date.now();
    for (const [key, p] of pending) if (p.expires < now) pending.delete(key);
    pending.set(interaction.id, {
      channelId: channel.id,
      color: colorFor(interaction.options.getString("color")),
      ping: interaction.options.getString("ping") ?? "none",
      roleId: interaction.options.getRole("role")?.id ?? null,
      image,
      bannerStyle: interaction.options.getString("banner"),
      buttonLabel,
      buttonUrl,
      expires: now + FIFTEEN_MINUTES,
    });

    const modal = new ModalBuilder()
      .setCustomId(`announce:${interaction.id}`)
      .setTitle("New announcement")
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId("title").setLabel("Title").setStyle(TextInputStyle.Short)
            .setMaxLength(256).setRequired(true).setPlaceholder("Game Night This Friday!")),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId("body").setLabel("Message").setStyle(TextInputStyle.Paragraph)
            .setMaxLength(4000).setRequired(true)
            .setPlaceholder("Supports **bold**, *italics*, lists, links, and emoji.")),
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

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const channel = await interaction.guild?.channels.fetch(p.channelId);
    if (!channel?.isTextBased()) throw new UserError("I can't post in that channel.");

    const guild = interaction.guild!;
    const embed = brandEmbed(p.color)
      .setTitle(interaction.fields.getTextInputValue("title"))
      .setDescription(interaction.fields.getTextInputValue("body"));
    embed.setAuthor({ name: guild.name, iconURL: guild.iconURL() ?? undefined });
    const footer = interaction.fields.getTextInputValue("footer");
    if (footer) embed.setFooter({ text: footer });

    const message: MessageCreateOptions = { embeds: [embed], allowedMentions: { parse: [], roles: [] } };

    if (p.image) {
      const name = `banner.${p.image.name.split(".").pop() || "png"}`;
      message.files = [new AttachmentBuilder(await download(p.image), { name })];
      embed.setImage(`attachment://${name}`);
    } else if (p.bannerStyle) {
      const png = renderBanner({ title: interaction.fields.getTextInputValue("title"), subtitle: guild.name, style: p.bannerStyle });
      message.files = [new AttachmentBuilder(png, { name: "banner.png" })];
      embed.setImage("attachment://banner.png");
    }
    if (p.buttonLabel && p.buttonUrl) {
      message.components = [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(p.buttonLabel).setURL(p.buttonUrl))];
    }

    const mentions: string[] = [];
    if (p.ping === "here" || p.ping === "everyone") {
      mentions.push(`@${p.ping}`);
      message.allowedMentions!.parse = ["everyone"];
    }
    if (p.roleId) {
      mentions.push(`<@&${p.roleId}>`);
      message.allowedMentions!.roles = [p.roleId];
    }
    if (mentions.length) message.content = mentions.join(" ");

    let sent;
    try {
      sent = await (channel as GuildTextBasedChannel).send(message);
    } catch (err) {
      console.error("announce send failed:", err);
      throw new UserError(`I couldn't post in <#${channel.id}>. Check that I can view, send messages, embed links, and attach files there.`);
    }
    await interaction.editReply(`Posted in <#${channel.id}>: ${sent.url}`);
  },
};
