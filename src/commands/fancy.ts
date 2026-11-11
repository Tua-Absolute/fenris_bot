import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { dividerChoices, dividers, fancy, fontChoices, fonts, withDivider, type DividerName } from "../lib/fonts.js";
import type { Command } from "./types.js";

export const fancyCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("fancy")
    .setDescription("Turn text into fancy fonts you can copy anywhere in Discord.")
    .addStringOption((o) => o.setName("text").setDescription("What to convert").setRequired(true).setMaxLength(300))
    .addStringOption((o) => o.setName("font").setDescription("Pick one font (default: preview all of them)").addChoices(...fontChoices.slice(0, 25)))
    .addStringOption((o) => o.setName("divider").setDescription("Wrap it in an emoji divider").addChoices(...dividerChoices))
    .addBooleanOption((o) => o.setName("post").setDescription("Post it in the channel instead of showing only you (needs a font)")),

  async execute(interaction) {
    const text = interaction.options.getString("text", true);
    const font = interaction.options.getString("font");
    const divider = interaction.options.getString("divider") as DividerName | null;
    const post = interaction.options.getBoolean("post") ?? false;

    if (font) {
      const result = withDivider(fancy(text, font), divider);
      await interaction.reply({
        content: result,
        allowedMentions: { parse: [] },
        ...(post ? {} : { flags: MessageFlags.Ephemeral }),
      });
      return;
    }

    // Preview every font so the person can pick and copy.
    const lines = Object.entries(fonts).map(([key, f]) => `**${key.replace(/_/g, " ")}**\n${fancy(text, key)}`);
    const dividerNote = divider && divider !== "none" ? `\n\n**divider: ${dividers[divider].name}**\n${withDivider(text, divider)}` : "";
    let content = `Copy the one you like, or run \`/fancy\` again with a \`font\` to get just that one.\n\n${lines.join("\n")}${dividerNote}`;
    if (content.length > 2000) content = content.slice(0, 1990) + "…";
    await interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  },
};
