import { Client, Events, GatewayIntentBits, MessageFlags, type RepliableInteraction } from "discord.js";
import { commands } from "./commands/index.js";
import { config } from "./config.js";
import { UserError } from "./lib/files.js";

const client = new Client({
  // More intents (reading messages for chat replies) get added as features need them.
  intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag} in ${c.guilds.cache.size} server(s).`);
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

await client.login(config.token());
