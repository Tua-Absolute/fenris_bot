import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { commands } from "./commands/index.js";
import { config } from "./config.js";

const client = new Client({
  // More intents (messages, scheduled events) get added as features need them.
  intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag} in ${c.guilds.cache.size} server(s).`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`/${interaction.commandName} failed:`, error);
    const msg = { content: "Something went wrong running that command.", flags: MessageFlags.Ephemeral } as const;
    if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
    else await interaction.reply(msg);
  }
});

process.on("unhandledRejection", (err) => console.error("Unhandled rejection:", err));

await client.login(config.token());
