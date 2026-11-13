import { Collection } from "discord.js";
import { announce } from "./announce.js";
import { automod } from "./automod.js";
import { banner } from "./banner.js";
import { birthday } from "./birthday.js";
import { bottrap } from "./bottrap.js";
import { catchup } from "./catchup.js";
import { event } from "./event.js";
import { fancyCommand } from "./fancy.js";
import { giveaway } from "./giveaway.js";
import { leaderboard, rank } from "./levels.js";
import { ping } from "./ping.js";
import { poll } from "./poll.js";
import { purge } from "./purge.js";
import { quotes } from "./quotes.js";
import { recap } from "./recap.js";
import { editRolePanel, roles } from "./roles.js";
import { rules } from "./rules.js";
import { schedule } from "./schedule.js";
import { settings } from "./settings.js";
import { stats } from "./stats.js";
import { ticket } from "./ticket.js";
import { timeout } from "./timeout.js";
import type { Command, MessageMenu } from "./types.js";
import { warn } from "./warn.js";

// Add each new command here; they register automatically when the bot starts.
const all: Command[] = [ping, announce, schedule, event, poll, banner, fancyCommand, settings, roles, warn, timeout, purge, automod, catchup, recap, ticket, rank, leaderboard, giveaway, stats, birthday, bottrap, rules, quotes];

export const commands = new Collection<string, Command>(all.map((c) => [c.data.name, c]));

// Right-click > Apps commands on messages.
export const menus = new Collection<string, MessageMenu>([editRolePanel].map((m) => [m.data.name, m]));
