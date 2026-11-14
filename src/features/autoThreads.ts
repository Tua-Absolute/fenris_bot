// Opens a thread on every screenshot (or every post) in the channels picked with /autothread.
import { ChannelType, Events, PermissionFlagsBits, type Client, type Message } from "discord.js";
import { getSettings } from "../lib/settings.js";

const IMAGE = /\.(png|jpe?g|gif|webp|heic|avif|bmp)$/i;

export const hasImage = (message: Message) =>
  message.attachments.some((a) => a.contentType?.startsWith("image/") || IMAGE.test(a.name ?? "")) ||
  message.embeds.some((e) => e.data.type === "image");

/** Fills {name}, {text}, and {date} in a thread name template. Discord allows 100 characters. */
export function threadName(template: string | undefined, message: Message): string {
  const name = message.member?.displayName ?? message.author.displayName;
  const text = message.cleanContent.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
  const short = text.length > 60 ? `${text.slice(0, 57).trimEnd()}...` : text;
  const date = message.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const filled = template
    ? template.replace(/\{name\}/g, name).replace(/\{text\}/g, short || "Screenshot").replace(/\{date\}/g, date)
    : short || `${name}'s screenshot`;
  return filled.slice(0, 100) || "Screenshot";
}

async function onMessage(message: Message) {
  if (!message.inGuild() || message.author.bot || message.system || message.hasThread) return;
  if (message.channel.type !== ChannelType.GuildText && message.channel.type !== ChannelType.GuildAnnouncement) return;
  const rule = getSettings(message.guildId).autoThreads?.[message.channelId];
  if (!rule || (rule.imagesOnly && !hasImage(message))) return;
  const me = message.guild.members.me;
  if (me && !message.channel.permissionsFor(me)?.has(PermissionFlagsBits.CreatePublicThreads)) return;
  await message.startThread({ name: threadName(rule.name, message), autoArchiveDuration: rule.archiveMinutes, reason: "Fenris auto-thread" })
    .catch((e) => console.error(`Auto-thread failed in #${message.channel.name}:`, (e as Error).message));
}

export function registerAutoThreads(client: Client) {
  client.on(Events.MessageCreate, (message) => void onMessage(message));
}
