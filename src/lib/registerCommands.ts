import { REST, Routes } from "discord.js";
import { commands, menus } from "../commands/index.js";
import { config } from "../config.js";

/** Registers (or updates) every slash command in your server. Safe to run any number of times. */
export async function registerCommands(): Promise<string[]> {
  const body = [...commands.map((c) => c.data.toJSON()), ...menus.map((m) => m.data.toJSON())];
  const rest = new REST().setToken(config.token());
  await rest.put(Routes.applicationGuildCommands(config.clientId(), config.guildId()), { body });
  return [...commands.map((c) => "/" + c.data.name), ...menus.map((m) => m.data.name)];
}
