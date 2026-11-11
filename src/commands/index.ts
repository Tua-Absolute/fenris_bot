import { Collection } from "discord.js";
import { announce } from "./announce.js";
import { banner } from "./banner.js";
import { event } from "./event.js";
import { fancyCommand } from "./fancy.js";
import { ping } from "./ping.js";
import { poll } from "./poll.js";
import { schedule } from "./schedule.js";
import type { Command } from "./types.js";

// Add each new command here, then run `npm run deploy-commands`.
const all: Command[] = [ping, announce, schedule, event, poll, banner, fancyCommand];

export const commands = new Collection<string, Command>(all.map((c) => [c.data.name, c]));
