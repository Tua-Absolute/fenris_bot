import { REST, Routes } from "discord.js";
import { commands, menus } from "../commands/index.js";
import { config } from "../config.js";

/** Commands that only make sense where Claude is allowed, so they're registered only in those servers. */
const CLAUDE_ONLY = new Set(["catchup", "recap"]);

/**
 * Registers (or updates) every slash command. Safe to run any number of times.
 * Most commands are global, so they work in every server that adds Fenris.
 * Claude-only commands are registered just in your Claude servers (see CHAT_GUILD_IDS).
 */
export async function registerCommands(): Promise<string[]> {
  const all = [...commands.map((c) => c.data.toJSON()), ...menus.map((m) => m.data.toJSON())];
  const global = all.filter((c) => !CLAUDE_ONLY.has(c.name));
  const claudeOnly = all.filter((c) => CLAUDE_ONLY.has(c.name));
  const rest = new REST().setToken(config.token());

  await rest.put(Routes.applicationCommands(config.clientId()), { body: global });
  for (const guildId of config.claudeServers()) {
    // Also replaces the older copies of every command that used to live here, so nothing shows up twice.
    await rest.put(Routes.applicationGuildCommands(config.clientId(), guildId), { body: config.chatEnabled() ? claudeOnly : [] })
      .catch((e) => console.error(`Couldn't register Claude commands in server ${guildId}:`, e));
  }
  return all.map((c) => ("type" in c && c.type !== 1 ? c.name : "/" + c.name));
}
