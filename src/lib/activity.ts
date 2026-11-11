// Counts messages per day and per channel so /stats can show how active the server is.
import { JsonStore } from "./store.js";

interface Activity { days: Record<string, number>; channels: Record<string, number> } // channels: last 7 days rolling-ish
const store = new JsonStore<Record<string, Activity>>("activity", {});

const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

export function countMessage(guildId: string, channelId: string) {
  const a = (store.data[guildId] ??= { days: {}, channels: {} });
  const today = dayKey();
  a.days[today] = (a.days[today] ?? 0) + 1;
  a.channels[`${today}|${channelId}`] = (a.channels[`${today}|${channelId}`] ?? 0) + 1;
  // keep 30 days
  const cutoff = dayKey(Date.now() - 30 * 86_400_000);
  for (const k of Object.keys(a.days)) if (k < cutoff) delete a.days[k];
  for (const k of Object.keys(a.channels)) if (k.slice(0, 10) < cutoff) delete a.channels[k];
  store.saveSoon(10_000);
}

export function activity(guildId: string) {
  const a = store.data[guildId] ?? { days: {}, channels: {} };
  const since = (days: number) => dayKey(Date.now() - (days - 1) * 86_400_000);
  const sum = (days: number) => Object.entries(a.days).filter(([k]) => k >= since(days)).reduce((n, [, v]) => n + v, 0);
  const top: Record<string, number> = {};
  for (const [k, v] of Object.entries(a.channels)) if (k.slice(0, 10) >= since(7)) top[k.slice(11)] = (top[k.slice(11)] ?? 0) + v;
  return {
    today: a.days[dayKey()] ?? 0,
    week: sum(7),
    month: sum(30),
    topChannels: Object.entries(top).sort((x, y) => y[1] - x[1]).slice(0, 5),
  };
}
