import { Client, Events, GatewayIntentBits, MessageFlags, type RepliableInteraction } from "discord.js";
import { handleChatButton, registerChat } from "./ai/chat.js";
import { commands } from "./commands/index.js";
import { config } from "./config.js";
import { startEventReminders } from "./features/eventReminders.js";
import { registerModLog } from "./features/modlogEvents.js";
import { registerLevels } from "./features/levels.js";
import { startWeeklyRecap } from "./features/weeklyRecap.js";
import { startGiveaways } from "./commands/giveaway.js";
import { registerMemberCounter } from "./commands/stats.js";
import { registerWelcome } from "./features/welcome.js";
import { UserError } from "./lib/files.js";
import { registerCommands } from "./lib/registerCommands.js";
import { startScheduler } from "./lib/schedule.js";

const chat = config.chatEnabled();

const client = new Client({
  // GuildMembers (welcome cards, joins) needs "Server Members Intent" and MessageContent (chat, mod log)
  // needs "Message Content Intent", both switched on in the Developer Portal.
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildScheduledEvents,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

if (chat) registerChat(client);
registerWelcome(client);
registerModLog(client);
registerLevels(client);
registerMemberCounter(client);

client.once(Events.ClientReady, async (c) => {
  console.log(`Logged in as ${c.user.tag} in ${c.guilds.cache.size} server(s).`);
  // Keep the server's slash commands in sync with this code, so updates never need a manual step.
  try {
    const names = await registerCommands();
    console.log(`Slash commands up to date (${names.length}).`);
  } catch (error) {
    console.error("Couldn't register slash commands. Is the bot in the server set by DISCORD_GUILD_ID?", error);
  }
  startScheduler(c);
  startEventReminders(c);
  startWeeklyRecap(c);
  startGiveaways(c);
  console.log(chat
    ? `Claude chat is ON (model: ${config.claudeModel()}, limit ${config.chatDailyLimit()} replies/day). Mention me to talk.`
    : "Claude chat is OFF. Add ANTHROPIC_API_KEY to .env to turn it on.");
});

async function fail(interaction: RepliableInteraction, label: string, error: unknown) {
  const text = error instanceof UserError ? error.message : "Something went wrong. Check the bot's terminal for details.";
  if (!(error instanceof UserError)) console.error(`${label} failed:`, error);
  const msg = { content: text, flags: MessageFlags.Ephemeral } as const;
  try {
    if (interaction.deferred) await interaction.editReply({ content: text });
    else if (interaction.replied) await interaction.followUp(msg);
    else await interaction.reply(msg);
  } catch (e) {
    console.error("Couldn't report the error to the user:", e);
  }
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    const command = commands.get(interaction.commandName);
    await command?.autocomplete?.(interaction).catch((e) => console.error("autocomplete failed:", e));
    return;
  }

  if (interaction.isChatInputCommand()) {
    const command = commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction);
    } catch (error) {
      await fail(interaction, `/${interaction.commandName}`, error);
    }
    return;
  }

  if (interaction.isButton()) {
    const prefix = interaction.customId.split(":")[0];
    const handler = prefix === "chat" ? handleChatButton : commands.get(prefix)?.handleButton;
    if (!handler) return;
    try {
      await handler(interaction);
    } catch (error) {
      await fail(interaction, `button ${interaction.customId}`, error);
    }
    return;
  }

  if (interaction.isModalSubmit()) {
    const command = commands.get(interaction.customId.split(":")[0]);
    if (!command?.handleModal) return;
    try {
      await command.handleModal(interaction);
    } catch (error) {
      await fail(interaction, `modal ${interaction.customId}`, error);
    }
  }
});

process.on("unhandledRejection", (err) => console.error("Unhandled rejection:", err));

// Hosts stop the bot with SIGTERM when deploying an update; disconnect cleanly so it goes offline at once.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    console.log(`${signal} received, shutting down.`);
    void client.destroy().finally(() => process.exit(0));
  });
}

try {
  await client.login(config.token());
} catch (error) {
  if (String(error).includes("disallowed intents")) {
    console.error('Discord refused to log in: in the Developer Portal (your app > Bot), turn on "Server Members Intent" and "Message Content Intent", save, then start me again.');
    process.exit(1);
  }
  throw error;
}
