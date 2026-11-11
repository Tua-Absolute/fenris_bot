import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { brandEmbed, colors, discordTime } from "../lib/brand.js";
import { targetMember } from "../lib/modcheck.js";
import { modLog } from "../lib/modlog.js";
import { addWarning, clearWarnings, listWarnings } from "../lib/warnings.js";
import type { Command } from "./types.js";

export const warn: Command = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Give, list, or clear warnings.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((s) => s.setName("add").setDescription("Warn a member. They get a DM and it's logged.")
      .addUserOption((o) => o.setName("user").setDescription("Who to warn").setRequired(true))
      .addStringOption((o) => o.setName("reason").setDescription("Why").setRequired(true).setMaxLength(500)))
    .addSubcommand((s) => s.setName("list").setDescription("Show a member's warnings.")
      .addUserOption((o) => o.setName("user").setDescription("Whose warnings").setRequired(true)))
    .addSubcommand((s) => s.setName("clear").setDescription("Remove one warning, or all of them.")
      .addUserOption((o) => o.setName("user").setDescription("Whose warnings").setRequired(true))
      .addStringOption((o) => o.setName("id").setDescription("Warning ID from /warn list (leave empty to clear all)"))),

  async execute(interaction) {
    const guild = interaction.guild!;
    const sub = interaction.options.getSubcommand();

    if (sub === "add") {
      const member = await targetMember(interaction);
      const reason = interaction.options.getString("reason", true);
      const { warning, total } = await addWarning(guild.id, member.id, interaction.user.id, reason);
      const dm = await member.send({
        embeds: [brandEmbed(colors.gold).setTitle(`⚠️ You were warned in ${guild.name}`).setDescription(reason)],
      }).then(() => true, () => false);
      await interaction.reply({
        embeds: [brandEmbed(colors.gold).setDescription(
          `⚠️ Warned <@${member.id}> (warning #${total}, ID \`${warning.id}\`).\n**Reason:** ${reason}${dm ? "" : "\n*Couldn't DM them (their DMs are closed).*"}`)],
        allowedMentions: { parse: [] },
      });
      await modLog(guild, brandEmbed(colors.gold).setTitle("⚠️ Warning")
        .setDescription(`**Member:** <@${member.id}> (${member.user.tag})\n**By:** <@${interaction.user.id}>\n**Reason:** ${reason}\n**Total warnings:** ${total}`));
      return;
    }

    const user = interaction.options.getUser("user", true);
    if (sub === "list") {
      const list = listWarnings(guild.id, user.id);
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        embeds: [brandEmbed(colors.gold).setTitle(`Warnings for ${user.tag}`).setDescription(list.length
          ? list.slice(-20).map((w) => `\`${w.id}\` ${discordTime(new Date(w.at), "f")} by <@${w.modId}>\n${w.reason}`).join("\n\n")
          : "No warnings. 😇")],
      });
      return;
    }

    const id = interaction.options.getString("id") ?? undefined;
    const removed = await clearWarnings(guild.id, user.id, id);
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: removed ? `Removed ${removed} warning${removed === 1 ? "" : "s"} from ${user.tag}.` : "Nothing to remove.",
    });
    if (removed) {
      await modLog(guild, brandEmbed(colors.green).setTitle("🧹 Warnings cleared")
        .setDescription(`**Member:** <@${user.id}>\n**By:** <@${interaction.user.id}>\n**Removed:** ${removed}`));
    }
  },
};
