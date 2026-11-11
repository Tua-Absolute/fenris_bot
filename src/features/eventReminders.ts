// Posts reminders 1 day and 1 hour before each event on the server calendar, in the channel set with
// /settings reminders. The 1-hour reminder pings the people who clicked "Interested".
import { GuildScheduledEventStatus, type Client, type GuildScheduledEvent, type GuildTextBasedChannel } from "discord.js";
import { brandEmbed, colors, discordTime } from "../lib/brand.js";
import { getSettings } from "../lib/settings.js";
import { JsonStore } from "../lib/store.js";

type Kind = "day" | "hour";
// eventId -> reminders already sent, plus the start time so old entries can be cleaned up
const sent = new JsonStore<Record<string, { start: number; kinds: Kind[] }>>("event-reminders", {});

const HOUR = 3_600_000;

/** Which reminder (if any) is due for an event that starts in `remaining` ms. */
export function dueReminder(remaining: number, already: Kind[]): Kind | null {
  if (remaining > 0 && remaining <= HOUR && !already.includes("hour")) return "hour";
  if (remaining > 20 * HOUR && remaining <= 24 * HOUR && !already.includes("day")) return "day";
  return null;
}

async function remind(event: GuildScheduledEvent, kind: Kind, channel: GuildTextBasedChannel) {
  const start = event.scheduledStartAt!;
  const where = event.channelId ? `<#${event.channelId}>` : event.entityMetadata?.location ?? "See event details";
  let pings = "";
  if (kind === "hour") {
    const subs = await event.fetchSubscribers({ limit: 100 }).catch(() => null);
    if (subs?.size) pings = subs.map((s) => `<@${s.user.id}>`).join(" ");
  }
  const embed = brandEmbed(colors.red)
    .setTitle(`${kind === "hour" ? "⏰ Starting soon" : "📅 Tomorrow"}: ${event.name}`)
    .setURL(event.url)
    .setDescription([
      event.description?.slice(0, 500) ?? "",
      "",
      `**When:** ${discordTime(start)} (${discordTime(start, "R")})`,
      `**Where:** ${where}`,
      event.userCount ? `**Interested:** ${event.userCount}` : "",
    ].filter((l, i) => l || i === 1).join("\n").trim());
  const cover = event.coverImageURL({ size: 1024 });
  if (cover) embed.setImage(cover);
  await channel.send({
    content: pings ? `${pings}\nStarting ${discordTime(start, "R")}!` : undefined,
    embeds: [embed],
    allowedMentions: { users: pings ? [...pings.matchAll(/<@(\d+)>/g)].map((m) => m[1]) : [] },
  });
}

async function check(client: Client<true>) {
  const now = Date.now();
  for (const guild of client.guilds.cache.values()) {
    const channelId = getSettings(guild.id).eventRemindersChannelId;
    if (!channelId) continue;
    const channel = guild.channels.cache.get(channelId);
    if (!channel?.isTextBased()) continue;
    const events = await guild.scheduledEvents.fetch().catch(() => null);
    if (!events) continue;
    for (const event of events.values()) {
      if (event.status !== GuildScheduledEventStatus.Scheduled || !event.scheduledStartTimestamp) continue;
      const entry = (sent.data[event.id] ??= { start: event.scheduledStartTimestamp, kinds: [] });
      if (entry.start !== event.scheduledStartTimestamp) entry.kinds = []; // rescheduled: remind again
      entry.start = event.scheduledStartTimestamp;
      const kind = dueReminder(entry.start - now, entry.kinds);
      if (!kind) continue;
      entry.kinds.push(kind === "hour" ? "hour" : "day");
      if (kind === "hour") entry.kinds.push("day"); // never send "tomorrow" after "starting soon"
      await sent.save();
      await remind(event, kind, channel as GuildTextBasedChannel)
        .catch((e) => console.error(`Event reminder for "${event.name}" failed:`, (e as Error).message));
    }
  }
  // Forget events that started more than a day ago.
  let changed = false;
  for (const [id, e] of Object.entries(sent.data)) if (e.start < now - 24 * HOUR) { delete sent.data[id]; changed = true; }
  if (changed) await sent.save();
}

export function startEventReminders(client: Client<true>) {
  void check(client);
  setInterval(() => void check(client), 60_000);
}
