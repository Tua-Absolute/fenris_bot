import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { applyLevelRoles } from "../features/levels.js";
import { brandEmbed, colors } from "../lib/brand.js";
import { UserError } from "../lib/files.js";
import { getXp, leaderboard as board, levelFromXp, progressBar, setXp, xpForNext } from "../lib/levels.js";
import { getSettings } from "../lib/settings.js";
import type { Command } from "./types.js";

const medal = (i: number) => ["🥇", "🥈", "🥉"][i] ?? `**${i + 1}.**`;

function needLevels(guildId: string) {
  if (!getSettings(guildId).levelsEnabled) throw new UserError("Levels are off. An admin can turn them on with `/settings levels`.");
}

export const rank: Command = {
  data: new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Show your level and XP, or someone else's.")
    .addUserOption((o) => o.setName("user").setDescription("Whose rank")),

  async execute(interaction) {
    const guildId = interaction.guildId!;
    needLevels(guildId);
    const user = interaction.options.getUser("user") ?? interaction.user;
    const { xp, messages } = getXp(guildId, user.id);
    const { level, into, needed } = levelFromXp(xp);
    const position = board(guildId).findIndex((e) => e.userId === user.id);
    const rewards = Object.entries(getSettings(guildId).levelRoles ?? {}).map(([l, r]) => [Number(l), r] as const)
      .filter(([l]) => l > level).sort((a, b) => a[0] - b[0]);
    await interaction.reply({
      embeds: [brandEmbed(colors.red).setAuthor({ name: user.displayName, iconURL: user.displayAvatarURL() })
        .setTitle(`Level ${level}`)
        .setDescription(`${progressBar(into, needed)} ${into}/${needed} XP\n\n` +
          `**Rank:** ${position >= 0 ? `#${position + 1}` : "unranked"} · **Total XP:** ${xp.toLocaleString()} · **Messages:** ${messages.toLocaleString()}` +
          (rewards.length ? `\n**Next reward:** <@&${rewards[0][1]}> at level ${rewards[0][0]}` : ""))],
      allowedMentions: { parse: [] },
    });
  },
};

export const leaderboard: Command = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("The most active members by XP.")
    .addSubcommand((s) => s.setName("show").setDescription("Show the top 10."))
    .addSubcommand((s) => s.setName("set").setDescription("Set a member's XP (admins).")
      .addUserOption((o) => o.setName("user").setDescription("Who").setRequired(true))
      .addIntegerOption((o) => o.setName("level").setDescription("Put them at the start of this level").setMinValue(0).setMaxValue(500).setRequired(true))),

  async execute(interaction) {
    const guild = interaction.guild!;
    needLevels(guild.id);
    if (interaction.options.getSubcommand() === "set") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) throw new UserError("Setting XP needs Manage Server.");
      const user = interaction.options.getUser("user", true);
      const level = interaction.options.getInteger("level", true);
      let xp = 0;
      for (let l = 0; l < level; l++) xp += xpForNext(l);
      await setXp(guild.id, user.id, xp);
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (member) await applyLevelRoles(member, level);
      await interaction.reply({ content: `<@${user.id}> is now level ${level} (${xp.toLocaleString()} XP).`, flags: MessageFlags.Ephemeral });
      return;
    }
    const top = board(guild.id).slice(0, 10);
    await interaction.reply({
      embeds: [brandEmbed(colors.red).setTitle(`🏆 ${guild.name} leaderboard`).setDescription(top.length
        ? top.map((e, i) => `${medal(i)} <@${e.userId}> · level ${levelFromXp(e.xp).level} · ${e.xp.toLocaleString()} XP`).join("\n")
        : "Nobody has XP yet. Start chatting! 🐺")],
      allowedMentions: { parse: [] },
    });
  },
};
