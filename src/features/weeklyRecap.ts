// Every Sunday at 6 PM (server time), Claude writes a recap of the week and posts it in the channel
// set with /settings recap.
import { AttachmentBuilder, GuildScheduledEventStatus, type Client, type Guild, type GuildTextBasedChannel } from "discord.js";
import { claudeAllowedIn, config } from "../config.js";
import { writeWithClaude } from "../ai/claude.js";
import { takeQuota } from "../ai/quota.js";
import { messagesSince, readableChannels, transcript } from "../ai/transcript.js";
import { renderBanner } from "../lib/banner.js";
import { brandEmbed, colors } from "../lib/brand.js";
import { serverIcon } from "../lib/serverIcon.js";
import { getSettings } from "../lib/settings.js";
import { JsonStore } from "../lib/store.js";
import { formatShort, partsInZone } from "../lib/time.js";

const WEEK = 7 * 86_400_000;
const MAX_CHARS = 80_000; // keeps one recap to a modest, predictable cost
const lastRun = new JsonStore<Record<string, string>>("recaps", {}); // guildId -> local date of last recap

const SYSTEM = `You are Fenris, a Discord server's bot, writing the server's weekly recap post.
Write in Discord markdown with a few fitting emoji, under 3000 characters:
- One upbeat opening line.
- "**Highlights**": 3 to 6 bullets on the biggest conversations, decisions, wins, and announcements, naming people.
- "**Coming up**": upcoming events if any were given (skip the section otherwise).
- A short friendly sign-off.
Only use what's in the messages. Skip channels that were just small talk. Never quote anything private or embarrassing.`;

export async function buildRecap(guild: Guild): Promise<{ embed: ReturnType<typeof brandEmbed>; files: AttachmentBuilder[] } | null> {
  const since = Date.now() - WEEK;
  const recapChannel = getSettings(guild.id).recapChannelId;
  const sections: { head: string; text: string }[] = [];
  let total = 0;
  let count = 0;
  for (const ch of readableChannels(guild)) {
    if (ch.id === recapChannel || ch.id === getSettings(guild.id).modLogChannelId) continue;
    const msgs = (await messagesSince(ch, since, 200)).filter((m) => !m.author.bot || m.embeds.length);
    if (!msgs.length) continue;
    count += msgs.length;
    const text = transcript(msgs, guild.client.user.id, 200);
    sections.push({ head: `#${ch.name} (${msgs.length} messages):`, text });
    total += text.length;
  }
  if (count < 5) return null;

  // Busiest channels first; trim to the budget.
  sections.sort((a, b) => b.text.length - a.text.length);
  const budget = Math.floor(MAX_CHARS / Math.max(sections.length, 1));
  const body = sections.map((s) => `${s.head}\n${total > MAX_CHARS ? s.text.slice(-budget) : s.text}`).join("\n\n");

  const events = (await guild.scheduledEvents.fetch().catch(() => null))
    ?.filter((e) => e.status === GuildScheduledEventStatus.Scheduled && e.scheduledStartTimestamp! < Date.now() + WEEK)
    .map((e) => `${e.name}: ${formatShort(e.scheduledStartAt!, config.timezone())}`) ?? [];

  const text = await writeWithClaude(SYSTEM, [
    `Server: ${guild.name} (${guild.memberCount} members)`,
    `Upcoming events this week: ${events.length ? events.join("; ") : "none"}`,
    "", "This week's messages by channel:", body,
  ].join("\n"), 2500);
  if (!text) return null;

  const now = new Date();
  const art = renderBanner({
    title: "Weekly Recap", subtitle: `${guild.name} · ${formatShort(now, config.timezone()).split(",").slice(0, 2).join(",")}`,
    style: "fenris", emblemImage: await serverIcon(guild),
  });
  return {
    embed: brandEmbed(colors.red).setTitle(`🐺 This week in ${guild.name}`).setDescription(text.slice(0, 4000))
      .setImage("attachment://recap.png").setFooter({ text: `${count} messages since ${new Date(since).toDateString()}` }),
    files: [new AttachmentBuilder(art, { name: "recap.png" })],
  };
}

export async function postRecap(guild: Guild, channel: GuildTextBasedChannel): Promise<boolean> {
  const recap = await buildRecap(guild);
  if (!recap) return false;
  await channel.send({ embeds: [recap.embed], files: recap.files, allowedMentions: { parse: [] } });
  return true;
}

async function check(client: Client<true>) {
  const tz = config.timezone();
  const p = partsInZone(new Date(), tz);
  if (p.weekday !== 0 || p.hour < 18) return; // Sunday, 6 PM or later
  const today = `${p.year}-${p.month}-${p.day}`;
  for (const guild of client.guilds.cache.values()) {
    const channelId = getSettings(guild.id).recapChannelId;
    if (!channelId || lastRun.data[guild.id] === today) continue;
    lastRun.data[guild.id] = today;
    await lastRun.save();
    const channel = guild.channels.cache.get(channelId);
    if (!channel?.isTextBased() || !claudeAllowedIn(guild.id) || !takeQuota(5)) continue;
    await postRecap(guild, channel as GuildTextBasedChannel)
      .then((ok) => console.log(ok ? `Posted weekly recap in ${guild.name}.` : `Quiet week in ${guild.name}, no recap.`))
      .catch((e) => console.error(`Weekly recap failed in ${guild.name}:`, e));
  }
}

export function startWeeklyRecap(client: Client<true>) {
  void check(client);
  setInterval(() => void check(client), 5 * 60_000);
}

