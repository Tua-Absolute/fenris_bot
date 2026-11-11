import { JsonStore } from "./store.js";

export interface GuildSettings {
  welcomeChannelId?: string;
  welcomeMessage?: string;
  welcomeStyle?: string;
  autoRoleId?: string;
  modLogChannelId?: string;
  ticketCategoryId?: string;
  ticketStaffRoleId?: string;
  levelsEnabled?: boolean;
  levelUpChannelId?: string;
  levelRoles?: Record<string, string>; // level -> role id
  faq?: string;
  recapChannelId?: string;
  eventRemindersChannelId?: string;
  memberCountChannelId?: string;
}

const store = new JsonStore<Record<string, GuildSettings>>("settings", {});

export function getSettings(guildId: string): GuildSettings {
  return (store.data[guildId] ??= {});
}

export async function updateSettings(guildId: string, patch: Partial<GuildSettings>): Promise<GuildSettings> {
  const s = getSettings(guildId);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined) delete (s as Record<string, unknown>)[k];
    else (s as Record<string, unknown>)[k] = v;
  }
  await store.save();
  return s;
}

export const DEFAULT_WELCOME = "Welcome to **{server}**, {user}! You're member #{count}. 🐺";

/** Fills {user}, {name}, {server}, {count} in a template. */
export function fillTemplate(template: string, vars: { user: string; name: string; server: string; count: number }): string {
  return template
    .replace(/\{user\}/gi, vars.user)
    .replace(/\{name\}/gi, vars.name)
    .replace(/\{server\}/gi, vars.server)
    .replace(/\{count\}/gi, String(vars.count));
}
