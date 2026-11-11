import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type GuildTextBasedChannel, type Message } from "discord.js";
import { brandEmbed, colors } from "../lib/brand.js";
import { UserError } from "../lib/files.js";
import { modLog } from "../lib/modlog.js";
import type { Command } from "./types.js";

const TWO_WEEKS = 14 * 86_400_000 - 60_000; // Discord can't bulk delete older messages

export const purge: Command = {
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Delete recent messages in this channel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((o) => o.setName("amount").setDescription("How many messages to check (1 to 100)").setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption((o) => o.setName("user").setDescription("Only delete messages from this person"))
    .addBooleanOption((o) => o.setName("bots").setDescription("Only delete messages from bots")),

  async execute(interaction) {
    const channel = interaction.channel as GuildTextBasedChannel | null;
    if (!channel || !("bulkDelete" in channel)) throw new UserError("I can't purge this channel.");
    const amount = interaction.options.getInteger("amount", true);
    const user = interaction.options.getUser("user");
    const bots = interaction.options.getBoolean("bots");
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const fetched = await channel.messages.fetch({ limit: amount });
    const cutoff = Date.now() - TWO_WEEKS;
    const doomed = fetched.filter((m: Message) =>
      !m.pinned && m.createdTimestamp > cutoff && (!user || m.author.id === user.id) && (!bots || m.author.bot));
    if (!doomed.size) {
      await interaction.editReply("Nothing to delete. (Discord can't bulk delete messages older than 14 days, and pinned messages are skipped.)");
      return;
    }
    const deleted = await channel.bulkDelete(doomed, true);
    await interaction.editReply(`🧹 Deleted ${deleted.size} message${deleted.size === 1 ? "" : "s"}.`);
    await modLog(interaction.guild!, brandEmbed(colors.red).setTitle("🧹 Purge").setDescription(
      `**Channel:** <#${channel.id}>\n**By:** <@${interaction.user.id}>\n**Deleted:** ${deleted.size}` +
      (user ? `\n**From:** <@${user.id}>` : "") + (bots ? "\n**Bots only**" : "")));
  },
};
