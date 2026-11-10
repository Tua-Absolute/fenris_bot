// Registers slash commands with your server. Run again whenever commands change.
import { REST, Routes } from "discord.js";
import { commands } from "./commands/index.js";
import { config } from "./config.js";

const body = commands.map((c) => c.data.toJSON());
const rest = new REST().setToken(config.token());

await rest.put(Routes.applicationGuildCommands(config.clientId(), config.guildId()), { body });
console.log(`Registered ${body.length} command(s): ${commands.map((c) => "/" + c.data.name).join(", ")}`);
