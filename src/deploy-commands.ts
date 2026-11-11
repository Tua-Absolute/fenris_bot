// Registers slash commands with your server. The bot also does this every time it starts,
// so you only need this to update commands without restarting.
import { registerCommands } from "./lib/registerCommands.js";

const names = await registerCommands();
console.log(`Registered ${names.length} command(s): ${names.join(", ")}`);
