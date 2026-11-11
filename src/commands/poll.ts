import { SlashCommandBuilder } from "discord.js";
import type { Command } from "./types.js";

const MAX_ANSWERS = 10;

const builder = new SlashCommandBuilder()
  .setName("poll")
  .setDescription("Start a poll (uses Discord's built-in polls).")
  .addStringOption((o) => o.setName("question").setDescription("What are you asking?").setRequired(true).setMaxLength(300));
for (let i = 1; i <= MAX_ANSWERS; i++) {
  builder.addStringOption((o) => o.setName(`answer${i}`).setDescription(`Choice ${i}`).setRequired(i <= 2).setMaxLength(55));
}
builder
  .addIntegerOption((o) => o.setName("hours").setDescription("How long voting stays open (default 24, max 768)").setMinValue(1).setMaxValue(768))
  .addBooleanOption((o) => o.setName("multiple").setDescription("Let people pick more than one answer"));

export const poll: Command = {
  data: builder,
  async execute(interaction) {
    const answers: { text: string }[] = [];
    for (let i = 1; i <= MAX_ANSWERS; i++) {
      const text = interaction.options.getString(`answer${i}`)?.trim();
      if (text) answers.push({ text });
    }
    await interaction.reply({
      poll: {
        question: { text: interaction.options.getString("question", true) },
        answers,
        duration: interaction.options.getInteger("hours") ?? 24,
        allowMultiselect: interaction.options.getBoolean("multiple") ?? false,
      },
    });
  },
};
