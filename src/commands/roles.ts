import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type GuildMember,
  type GuildTextBasedChannel,
  type Role,
} from "discord.js";
import { brandEmbed, colors } from "../lib/brand.js";
import { UserError } from "../lib/files.js";
import type { Command } from "./types.js";

const MAX_ROLES = 15;

// Roles with these permissions are never handed out by a button.
// (Mention @everyone is left out on purpose: Discord turns it on for every new role by default.)
const DANGEROUS = {
  Administrator: PermissionFlagsBits.Administrator,
  "Manage Server": PermissionFlagsBits.ManageGuild,
  "Manage Roles": PermissionFlagsBits.ManageRoles,
  "Manage Channels": PermissionFlagsBits.ManageChannels,
  "Ban Members": PermissionFlagsBits.BanMembers,
  "Kick Members": PermissionFlagsBits.KickMembers,
  "Manage Messages": PermissionFlagsBits.ManageMessages,
  "Timeout Members": PermissionFlagsBits.ModerateMembers,
  "Manage Webhooks": PermissionFlagsBits.ManageWebhooks,
};

const builder = new SlashCommandBuilder()
  .setName("roles")
  .setDescription("Post a panel of buttons members click to give themselves roles.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addStringOption((o) => o.setName("title").setDescription("Panel title, e.g. \"Pick your games\"").setRequired(true).setMaxLength(200));
for (let i = 1; i <= MAX_ROLES; i++) {
  builder.addRoleOption((o) => o.setName(`role${i}`).setDescription(`Role ${i}`).setRequired(i === 1));
}
builder.addStringOption((o) => o.setName("description").setDescription("Text above the buttons").setMaxLength(1000));
builder.addBooleanOption((o) => o.setName("pick_one").setDescription("Members can hold only one role from this panel (picking one swaps out the other)"));
const MAX_EXCLUDE = 3;
for (let i = 1; i <= MAX_EXCLUDE; i++) {
  builder.addRoleOption((o) => o.setName(`exclude${i}`).setDescription(`Members with this role can't use the panel${i === 1 ? " (e.g. Muted or Unverified)" : ""}`));
}

// Button IDs carry the panel's rules so they keep working after restarts: roles:<roleId>:<1 if pick one>:<excluded ids>
function parseId(customId: string) {
  const [, roleId, one = "", ex = ""] = customId.split(":");
  return { roleId, pickOne: one === "1", excluded: ex ? ex.split(",") : [] };
}

function checkRole(role: Role, me: GuildMember): string | null {
  if (role.managed || role.id === role.guild.id) return `${role.name} is managed by Discord or an integration.`;
  const risky = Object.entries(DANGEROUS).filter(([, p]) => role.permissions.has(p, false)).map(([name]) => name);
  if (risky.length) return `${role.name} has ${risky.join(", ")}, so I won't hand it out. Turn that off in Server Settings > Roles > ${role.name} if members shouldn't have it.`;
  if (role.position >= me.roles.highest.position) return `${role.name} is above my highest role. Drag my role above it in Server Settings > Roles.`;
  return null;
}

export const roles: Command = {
  data: builder,

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) throw new UserError("This only works inside a server.");
    const me = await guild.members.fetchMe();

    const picked: Role[] = [];
    for (let i = 1; i <= MAX_ROLES; i++) {
      const r = interaction.options.getRole(`role${i}`);
      if (r && !picked.some((p) => p.id === r.id)) picked.push(guild.roles.cache.get(r.id)!);
    }
    const problems = picked.map((r) => checkRole(r, me)).filter(Boolean);
    if (problems.length) throw new UserError(problems.join("\n"));

    const pickOne = interaction.options.getBoolean("pick_one") ?? false;
    const excluded: string[] = [];
    for (let i = 1; i <= MAX_EXCLUDE; i++) {
      const r = interaction.options.getRole(`exclude${i}`);
      if (r && !excluded.includes(r.id)) excluded.push(r.id);
    }
    if (excluded.some((id) => picked.some((p) => p.id === id))) throw new UserError("A role can't be both on the panel and excluded.");
    const suffix = `:${pickOne ? "1" : ""}:${excluded.join(",")}`;

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    picked.forEach((role, i) => {
      if (i % 5 === 0) rows.push(new ActionRowBuilder<ButtonBuilder>());
      rows[rows.length - 1].addComponents(
        new ButtonBuilder().setCustomId(`roles:${role.id}${suffix}`).setLabel(role.name.slice(0, 80)).setStyle(ButtonStyle.Secondary));
    });

    const embed = brandEmbed(colors.red)
      .setTitle(interaction.options.getString("title", true))
      .setDescription(`${interaction.options.getString("description") ?? (pickOne
        ? "Click a button to pick your role. Picking another swaps it."
        : "Click a button to get a role. Click again to remove it.")}\n\n` +
        picked.map((r) => `• <@&${r.id}>`).join("\n") +
        (excluded.length ? `\n\n*Not available to ${excluded.map((id) => `<@&${id}>`).join(", ")}.*` : ""));
    await interaction.reply({ content: "Posting the role panel…", flags: MessageFlags.Ephemeral });
    await (interaction.channel as GuildTextBasedChannel).send({ embeds: [embed], components: rows });
  },

  async handleButton(interaction) {
    const { roleId, pickOne, excluded } = parseId(interaction.customId);
    const guild = interaction.guild!;
    const role = guild.roles.cache.get(roleId);
    const member = await guild.members.fetch(interaction.user.id);
    const blockedBy = excluded.find((id) => member.roles.cache.has(id));
    if (blockedBy) {
      await interaction.reply({ content: `Members with <@&${blockedBy}> can't use this panel.`, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
      return;
    }
    const me = await guild.members.fetchMe();
    const problem = role ? checkRole(role, me) : "That role no longer exists.";
    if (problem) {
      await interaction.reply({ content: `I can't change that role: ${problem}`, flags: MessageFlags.Ephemeral });
      return;
    }
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId, "Role panel");
      await interaction.reply({ content: `Removed <@&${roleId}>.`, flags: MessageFlags.Ephemeral });
    } else {
      // In pick-one panels, drop the other roles from this panel first.
      const others = pickOne
        ? [...JSON.stringify(interaction.message.components.map((row) => row.toJSON()))
          .matchAll(/"custom_id":"roles:(\d+)/g)].map((m) => m[1])
          .filter((id) => id !== roleId && member.roles.cache.has(id))
        : [];
      if (others.length) await member.roles.remove(others, "Role panel (pick one)");
      await member.roles.add(roleId, "Role panel");
      await interaction.reply({
        content: `You now have <@&${roleId}>.${others.length ? ` Swapped out ${others.map((id) => `<@&${id}>`).join(", ")}.` : ""}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
