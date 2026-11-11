import { Collection } from "discord.js";
import { announce } from "./announce.js";
import { automod } from "./automod.js";
import { banner } from "./banner.js";
import { event } from "./event.js";
import { fancyCommand } from "./fancy.js";
import { ping } from "./ping.js";
import { poll } from "./poll.js";
import { purge } from "./purge.js";
import { roles } from "./roles.js";
import { schedule } from "./schedule.js";
import { settings } from "./settings.js";
import { timeout } from "./timeout.js";
import type { Command } from "./types.js";
import { warn } from "./warn.js";

// Add each new command here; they register automatically when the bot starts.
const all: Command[] = [ping, announce, schedule, event, poll, banner, fancyCommand, settings, roles, warn, timeout, purge, automod];

export const commands = new Collection<string, Command>(all.map((c) => [c.data.name, c]));
