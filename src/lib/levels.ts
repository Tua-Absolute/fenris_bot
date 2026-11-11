import { JsonStore } from "./store.js";

export interface XpEntry { xp: number; last: number; messages: number }
// guildId -> userId -> xp
const store = new JsonStore<Record<string, Record<string, XpEntry>>>("levels", {});

export const XP_COOLDOWN_MS = 60_000;

/** XP needed to go from `level` to `level + 1`. */
export const xpForNext = (level: number) => 5 * level * level + 50 * level + 100;

/** Level and progress for a total XP amount. */
export function levelFromXp(xp: number): { level: number; into: number; needed: number } {
  let level = 0;
  let left = xp;
  while (left >= xpForNext(level)) { left -= xpForNext(level); level++; }
  return { level, into: left, needed: xpForNext(level) };
}

export function getXp(guildId: string, userId: string): XpEntry {
  return store.data[guildId]?.[userId] ?? { xp: 0, last: 0, messages: 0 };
}

/** Adds message XP if the cooldown has passed. Returns the new level when the member levels up. */
export function awardMessageXp(guildId: string, userId: string, now = Date.now()): { levelUp: number | null; gained: boolean } {
  const entry = ((store.data[guildId] ??= {})[userId] ??= { xp: 0, last: 0, messages: 0 });
  entry.messages++;
  if (now - entry.last < XP_COOLDOWN_MS) { store.saveSoon(); return { levelUp: null, gained: false }; }
  const before = levelFromXp(entry.xp).level;
  entry.xp += 15 + Math.floor(Math.random() * 11); // 15 to 25
  entry.last = now;
  store.saveSoon();
  const after = levelFromXp(entry.xp).level;
  return { levelUp: after > before ? after : null, gained: true };
}

export async function setXp(guildId: string, userId: string, xp: number) {
  const entry = ((store.data[guildId] ??= {})[userId] ??= { xp: 0, last: 0, messages: 0 });
  entry.xp = Math.max(0, Math.round(xp));
  await store.save();
}

export function leaderboard(guildId: string): { userId: string; xp: number }[] {
  return Object.entries(store.data[guildId] ?? {}).map(([userId, e]) => ({ userId, xp: e.xp }))
    .filter((e) => e.xp > 0).sort((a, b) => b.xp - a.xp);
}

export function progressBar(into: number, needed: number, width = 12): string {
  const filled = Math.round((into / needed) * width);
  return "▰".repeat(filled) + "▱".repeat(width - filled);
}
