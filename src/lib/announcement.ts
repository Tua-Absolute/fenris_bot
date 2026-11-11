// One place that turns announcement settings into a Discord message, used by /announce,
// the scheduler, and Claude chat.
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  type EmbedBuilder,
  type Guild,
  type MessageCreateOptions,
} from "discord.js";
import { readFile } from "node:fs/promises";
import { renderBanner } from "./banner.js";
import { brandEmbed } from "./brand.js";
import { fancy, resolveCustomEmoji, withDivider } from "./fonts.js";
import { serverIcon } from "./serverIcon.js";

export interface AnnouncementData {
  channelId: string;
  title: string;
  body: string;
  footer?: string;
  color: number;
  ping?: "none" | "here" | "everyone";
  roleId?: string;
  /** Generate a banner in this style (ignored when imageFile is set). */
  bannerStyle?: string;
  /** Path to an uploaded image saved on disk. */
  imageFile?: string;
  buttonLabel?: string;
  buttonUrl?: string;
  titleFont?: string;
  divider?: string;
}

export async function buildAnnouncement(guild: Guild, a: AnnouncementData): Promise<{ message: MessageCreateOptions; embed: EmbedBuilder }> {
  const emojis = guild.emojis.cache.values();
  const embed = brandEmbed(a.color)
    .setAuthor({ name: guild.name, iconURL: guild.iconURL() ?? undefined })
    .setTitle(fancy(a.title, a.titleFont).slice(0, 256))
    .setDescription(withDivider(resolveCustomEmoji(a.body, emojis), a.divider).slice(0, 4096));
  if (a.footer) embed.setFooter({ text: a.footer.slice(0, 2048) });

  const message: MessageCreateOptions = { embeds: [embed], allowedMentions: { parse: [], roles: [] } };

  if (a.imageFile) {
    const name = `banner.${a.imageFile.split(".").pop() || "png"}`;
    message.files = [new AttachmentBuilder(await readFile(a.imageFile), { name })];
    embed.setImage(`attachment://${name}`);
  } else if (a.bannerStyle && a.bannerStyle !== "none") {
    // The banner shows the plain title: fancy-font characters aren't in the banner font.
    const png = renderBanner({ title: a.title, subtitle: guild.name, style: a.bannerStyle, emblemImage: await serverIcon(guild) });
    message.files = [new AttachmentBuilder(png, { name: "banner.png" })];
    embed.setImage("attachment://banner.png");
  }

  if (a.buttonLabel && a.buttonUrl) {
    message.components = [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(a.buttonLabel).setURL(a.buttonUrl))];
  }

  const mentions: string[] = [];
  if (a.ping === "here" || a.ping === "everyone") {
    mentions.push(`@${a.ping}`);
    message.allowedMentions!.parse = ["everyone"];
  }
  if (a.roleId) {
    mentions.push(`<@&${a.roleId}>`);
    message.allowedMentions!.roles = [a.roleId];
  }
  if (mentions.length) message.content = mentions.join(" ");

  return { message, embed };
}
