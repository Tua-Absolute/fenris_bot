import { AttachmentBuilder, SlashCommandBuilder } from "discord.js";
import { bannerStyleChoices, renderBanner } from "../lib/banner.js";
import { emblemChoices, emblemFor } from "../lib/serverIcon.js";
import type { Command } from "./types.js";

export const banner: Command = {
  data: new SlashCommandBuilder()
    .setName("banner")
    .setDescription("Generate a banner image in the Fenris style.")
    .addStringOption((o) => o.setName("title").setDescription("Big text on the banner").setRequired(true).setMaxLength(90))
    .addStringOption((o) => o.setName("subtitle").setDescription("Smaller line under the title, e.g. a date").setMaxLength(60))
    .addStringOption((o) => o.setName("style").setDescription("Color style (default: Fenris red & black)").addChoices(...bannerStyleChoices))
    .addStringOption((o) => o.setName("emblem").setDescription("Picture on the right (default: the server icon)").addChoices(...emblemChoices)),

  async execute(interaction) {
    await interaction.deferReply();
    const png = renderBanner({
      title: interaction.options.getString("title", true),
      subtitle: interaction.options.getString("subtitle") ?? undefined,
      style: interaction.options.getString("style") ?? "fenris",
      ...(await emblemFor(interaction.guild!, interaction.options.getString("emblem"))),
    });
    await interaction.editReply({ files: [new AttachmentBuilder(png, { name: "banner.png" })] });
  },
};
