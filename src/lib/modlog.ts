import type { EmbedBuilder, Guild, GuildTextBasedChannel } from "discord.js";
import { getSettings } from "./settings.js";

/** Posts an embed to the server's mod log channel, if one is set. Never throws. */
export async function modLog(guild: Guild, embed: EmbedBuilder): Promise<void> {
  const id = getSettings(guild.id).modLogChannelId;
  if (!id) return;
  try {
    const ch = guild.channels.cache.get(id) ?? await guild.channels.fetch(id);
    if (ch?.isTextBased()) await (ch as GuildTextBasedChannel).send({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch (e) {
    console.error(`Mod log post failed in ${guild.name}:`, (e as Error).message);
  }
}

/** Parses durations like 10m, 2h, 1d, 1h30m, or a bare number of minutes. Returns milliseconds or null. */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, "");
  if (/^\d+$/.test(s)) return Number(s) * 60_000;
  const re = /(\d+(?:\.\d+)?)(w|d|h|m|s)/g;
  const unit = { w: 604_800_000, d: 86_400_000, h: 3_600_000, m: 60_000, s: 1000 } as const;
  let total = 0;
  let consumed = 0;
  for (const m of s.matchAll(re)) {
    total += Number(m[1]) * unit[m[2] as keyof typeof unit];
    consumed += m[0].length;
  }
  return consumed === s.length && total > 0 ? Math.round(total) : null;
}

/** "1 d 2 h 5 m" style text for a duration. */
export function formatDuration(ms: number): string {
  const parts: string[] = [];
  const d = Math.floor(ms / 86_400_000); if (d) parts.push(`${d}d`);
  const h = Math.floor(ms / 3_600_000) % 24; if (h) parts.push(`${h}h`);
  const m = Math.floor(ms / 60_000) % 60; if (m) parts.push(`${m}m`);
  return parts.join(" ") || "under a minute";
}
