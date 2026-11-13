// Posts an inspirational quote on a schedule (daily, weekly, every 2 weeks, or monthly). No Claude involved.
import type { Client, Guild, GuildTextBasedChannel } from "discord.js";
import { config } from "../config.js";
import { brandEmbed, colors } from "../lib/brand.js";
import { nextQuote } from "../lib/quotes.js";
import { getSettings, updateSettings, type GuildSettings } from "../lib/settings.js";
import { partsInZone } from "../lib/time.js";

type QuoteSettings = NonNullable<GuildSettings["quotes"]>;

export const FREQUENCY_TITLE: Record<QuoteSettings["frequency"], string> = {
  daily: "Quote of the Day", weekly: "Quote of the Week", biweekly: "Quote of the Week", monthly: "Quote of the Month",
};

const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** True when a quote should go out now (and hasn't already today). */
export function isDue(q: QuoteSettings, now: Date, timeZone: string): boolean {
  const p = partsInZone(now, timeZone);
  const today = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  if (p.hour < q.hour || q.lastPosted === today) return false;
  switch (q.frequency) {
    case "daily": return true;
    case "weekly": return p.weekday === q.weekday;
    case "biweekly": return p.weekday === q.weekday && (!q.lastPosted || dayNumber(today) - dayNumber(q.lastPosted) >= 13);
    case "monthly": return p.day === Math.min(q.monthDay, daysInMonth(p.year, p.month));
  }
}

export async function postQuote(guild: Guild, channel: GuildTextBasedChannel, title = "Quote of the Day", customOnly = false) {
  const q = await nextQuote(guild.id, customOnly);
  await channel.send({
    embeds: [brandEmbed(colors.red).setTitle(`💭 ${title}`).setDescription(`*${q.text}*\n\n**— ${q.author}**`).setFooter({ text: guild.name })],
    allowedMentions: { parse: [] },
  });
}

async function check(client: Client<true>) {
  const tz = config.timezone();
  const now = new Date();
  const p = partsInZone(now, tz);
  const today = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  for (const guild of client.guilds.cache.values()) {
    const q = getSettings(guild.id).quotes;
    if (!q || !isDue(q, now, tz)) continue;
    await updateSettings(guild.id, { quotes: { ...q, lastPosted: today } });
    const channel = guild.channels.cache.get(q.channelId);
    if (!channel?.isTextBased()) continue;
    await postQuote(guild, channel as GuildTextBasedChannel, FREQUENCY_TITLE[q.frequency], q.customOnly)
      .catch((e) => console.error(`Quote post failed in ${guild.name}:`, e));
  }
}

export function startQuotes(client: Client<true>) {
  void check(client);
  setInterval(() => void check(client), 5 * 60_000);
}
