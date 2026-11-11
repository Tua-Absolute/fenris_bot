import { Collection } from "discord.js";
import { announce } from "./announce.js";
import { event } from "./event.js";
import { ping } from "./ping.js";
import { poll } from "./poll.js";
import type { Command } from "./types.js";

// Add each new command here, then run `npm run deploy-commands`.
const all: Command[] = [ping, announce, event, poll];

export const commands = new Collection<string, Command>(all.map((c) => [c.data.name, c]));
