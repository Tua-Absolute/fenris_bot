import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { brandEmbed, colors, discordTime } from "../lib/brand.js";
import { UserError } from "../lib/files.js";
import { listScheduled, removeScheduled } from "../lib/schedule.js";
import type { Command } from "./types.js";

export const schedule: Command = {
  data: new SlashCommandBuilder()
    .setName("schedule")
    .setDescription("See or cancel scheduled announcements.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((s) => s.setName("list").setDescription("Show announcements waiting to be posted."))
    .addSubcommand((s) => s.setName("cancel").setDescription("Cancel a scheduled announcement.")
      .addStringOption((o) => o.setName("announcement").setDescription("Which one").setRequired(true).setAutocomplete(true))),

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) throw new UserError("This only works inside a server.");

    if (interaction.options.getSubcommand() === "list") {
      const items = listScheduled(guild.id);
      const embed = brandEmbed(colors.red).setTitle("Scheduled announcements").setDescription(
        items.length
          ? items.slice(0, 20).map((i) =>
            `\`${i.id}\` **${i.data.title}**\n${discordTime(new Date(i.postAt), "f")} (${discordTime(new Date(i.postAt), "R")}) in <#${i.data.channelId}>`).join("\n\n")
          : "Nothing scheduled. Use the `when` option on `/announce` to schedule one.");
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    const id = interaction.options.getString("announcement", true);
    const mine = listScheduled(guild.id).find((i) => i.id === id);
    if (!mine) throw new UserError("I couldn't find that one. Pick it from the suggestions as you type.");
    await removeScheduled(id);
    await interaction.reply({ content: `Cancelled **${mine.data.title}**.`, flags: MessageFlags.Ephemeral });
  },

  async autocomplete(interaction) {
    const typed = interaction.options.getFocused().toLowerCase();
    await interaction.respond(
      listScheduled(interaction.guildId!)
        .filter((i) => i.data.title.toLowerCase().includes(typed) || i.id.startsWith(typed))
        .slice(0, 25)
        .map((i) => ({ name: `${i.data.title} (${new Date(i.postAt).toISOString().slice(0, 16).replace("T", " ")} UTC)`.slice(0, 100), value: i.id })),
    );
  },
};
