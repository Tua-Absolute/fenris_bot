import { randomBytes } from "node:crypto";
import { JsonStore } from "./store.js";

export interface Warning { id: string; reason: string; modId: string; at: number }

// guildId -> userId -> warnings
const store = new JsonStore<Record<string, Record<string, Warning[]>>>("warnings", {});

export function listWarnings(guildId: string, userId: string): Warning[] {
  return store.data[guildId]?.[userId] ?? [];
}

export async function addWarning(guildId: string, userId: string, modId: string, reason: string): Promise<{ warning: Warning; total: number }> {
  const list = ((store.data[guildId] ??= {})[userId] ??= []);
  const warning = { id: randomBytes(3).toString("hex"), reason, modId, at: Date.now() };
  list.push(warning);
  await store.save();
  return { warning, total: list.length };
}

/** Removes one warning by id, or all of them when id is omitted. Returns how many were removed. */
export async function clearWarnings(guildId: string, userId: string, id?: string): Promise<number> {
  const list = store.data[guildId]?.[userId];
  if (!list?.length) return 0;
  const before = list.length;
  const kept = id ? list.filter((w) => w.id !== id) : [];
  if (kept.length) store.data[guildId][userId] = kept;
  else delete store.data[guildId][userId];
  await store.save();
  return before - kept.length;
}
