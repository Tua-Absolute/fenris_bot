import { Collection } from "discord.js";
import { ping } from "./ping.js";
import type { Command } from "./types.js";

// Add each new command here (announce, event, poll, ...).
const all: Command[] = [ping];

export const commands = new Collection<string, Command>(all.map((c) => [c.data.name, c]));
