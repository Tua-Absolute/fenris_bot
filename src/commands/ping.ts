import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import type { Command } from "./types.js";

export const ping: Command = {
  data: new SlashCommandBuilder().setName("ping").setDescription("Check that the bot is online."),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Pong!")
      .setDescription(`Online and listening. Gateway latency: **${interaction.client.ws.ping} ms**`)
      .setTimestamp();
    await interaction.reply({ embeds: [embed] });
  },
};
