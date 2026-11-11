import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type Message,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type Guild,
  type GuildMember,
  type GuildTextBasedChannel,
  type Role,
} from "discord.js";
import { brandEmbed, colors } from "../lib/brand.js";
import { UserError } from "../lib/files.js";
import type { Command, MessageMenu } from "./types.js";

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
builder.addStringOption((o) => o.setName("role_descriptions")
  .setDescription("A note for each role, in order, split with |  e.g. Pinged for game nights | Art drops").setMaxLength(1500));
builder.addStringOption((o) => o.setName("button_color").setDescription("Button color (default grey)").addChoices(
  { name: "Red", value: "red" }, { name: "Blurple", value: "blurple" }, { name: "Green", value: "green" }, { name: "Grey", value: "grey" },
  { name: "Rainbow (cycle through all)", value: "mix" }));
builder.addStringOption((o) => o.setName("emojis")
  .setDescription("An emoji for each role, in order, split with |  e.g. 🏐 | 🐤 | :my_emoji:").setMaxLength(1000));
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

type Emoji = string | { id: string; name: string; animated: boolean };

/** Unicode emoji as-is, or a custom emoji from <:name:id> or :name: (this server's). */
function resolveEmoji(guild: Guild, text?: string): Emoji | null {
  if (!text) return null;
  const custom = text.match(/^<(a?):(\w+):(\d+)>$/);
  if (custom) return { id: custom[3], name: custom[2], animated: !!custom[1] };
  const named = text.match(/^:(\w+):$/);
  if (named) {
    const e = guild.emojis.cache.find((x) => x.name === named[1]);
    return e ? { id: e.id, name: e.name!, animated: !!e.animated } : null;
  }
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(text) && text.length <= 16 ? text : null;
}

const emojiMarkup = (e: Emoji) => (typeof e === "string" ? e : `<${e.animated ? "a" : ""}:${e.name}:${e.id}>`);

const STYLES: Record<string, ButtonStyle> = { red: ButtonStyle.Danger, blurple: ButtonStyle.Primary, green: ButtonStyle.Success, grey: ButtonStyle.Secondary };
const CYCLE = [ButtonStyle.Danger, ButtonStyle.Primary, ButtonStyle.Success, ButtonStyle.Secondary];

interface PanelSpec {
  title: string;
  description?: string;
  roles: { role: Role; emoji?: string; note?: string }[];
  color: string; // red | blurple | green | grey | mix
  pickOne: boolean;
  excluded: string[];
}

/** Builds the embed and buttons for a role panel. Throws a UserError when something can't be used. */
function buildPanel(guild: Guild, spec: PanelSpec): { embed: ReturnType<typeof brandEmbed>; rows: ActionRowBuilder<ButtonBuilder>[] } {
  if (!spec.roles.length) throw new UserError("A role panel needs at least one role.");
  if (spec.roles.length > MAX_ROLES) throw new UserError(`A role panel can have up to ${MAX_ROLES} roles.`);
  if (spec.excluded.some((id) => spec.roles.some((r) => r.role.id === id))) throw new UserError("A role can't be both on the panel and excluded.");
  if (!(spec.color in STYLES) && spec.color !== "mix") throw new UserError("Button color must be red, blurple, green, grey, or mix.");
  // Typed emoji, or the role's own icon emoji if it has one.
  const emojis = spec.roles.map((r) => resolveEmoji(guild, r.emoji) ?? (r.role.unicodeEmoji || null));
  const bad = spec.roles.map((r, i) => (r.emoji && !emojis[i] ? r.emoji : null)).filter(Boolean);
  if (bad.length) throw new UserError(`I couldn't use ${bad.join(", ")} as emoji. Use normal emoji or this server's custom emoji like :name:.`);

  const suffix = `:${spec.pickOne ? "1" : ""}:${spec.excluded.join(",")}`;
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  spec.roles.forEach(({ role }, i) => {
    if (i % 5 === 0) rows.push(new ActionRowBuilder<ButtonBuilder>());
    const button = new ButtonBuilder().setCustomId(`roles:${role.id}${suffix}`).setLabel(role.name.slice(0, 80))
      .setStyle(spec.color === "mix" ? CYCLE[i % CYCLE.length] : STYLES[spec.color]);
    if (emojis[i]) button.setEmoji(emojis[i]!);
    rows[rows.length - 1].addComponents(button);
  });

  const embed = brandEmbed(colors.red).setTitle(spec.title.slice(0, 256)).setDescription((
    `${spec.description || (spec.pickOne
      ? "Click a button to pick your role. Picking another swaps it."
      : "Click a button to get a role. Click again to remove it.")}\n\n` +
    spec.roles.map((r, i) => `${emojis[i] ? emojiMarkup(emojis[i]!) : "•"} <@&${r.role.id}>${r.note ? ` — ${r.note.slice(0, 200)}` : ""}`).join("\n") +
    (spec.excluded.length ? `\n\n*Not available to ${spec.excluded.map((id) => `<@&${id}>`).join(", ")}.*` : "")).slice(0, 4096));
  return { embed, rows };
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
    const notes = (interaction.options.getString("role_descriptions") ?? "").split("|").map((t) => t.trim());
    if (notes.filter(Boolean).length > picked.length) {
      throw new UserError(`You gave ${notes.filter(Boolean).length} descriptions for ${picked.length} roles. Split them with | in the same order as the roles.`);
    }
    const emojiText = (interaction.options.getString("emojis") ?? "").split("|").map((t) => t.trim());
    const { embed, rows } = buildPanel(guild, {
      title: interaction.options.getString("title", true),
      description: interaction.options.getString("description") ?? undefined,
      roles: picked.map((role, i) => ({ role, emoji: emojiText[i] || undefined, note: notes[i] || undefined })),
      color: interaction.options.getString("button_color") ?? "grey",
      pickOne,
      excluded,
    });
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

// ---- Editing an existing panel: right-click the panel > Apps > Edit role panel ----

const DEFAULT_TEXTS = [
  "Click a button to pick your role. Picking another swaps it.",
  "Click a button to get a role. Click again to remove it.",
];
const STYLE_NAMES: Record<number, string> = { [ButtonStyle.Danger]: "red", [ButtonStyle.Primary]: "blurple", [ButtonStyle.Success]: "green", [ButtonStyle.Secondary]: "grey" };

interface ButtonInfo { roleId: string; label: string; emoji?: string; style: number; pickOne: boolean; excluded: string[] }

function panelButtons(message: Message): ButtonInfo[] {
  const out: ButtonInfo[] = [];
  for (const row of message.components.map((r) => r.toJSON()) as { components?: { custom_id?: string; label?: string; style: number; emoji?: { id?: string | null; name?: string | null; animated?: boolean } }[] }[]) {
    for (const c of row.components ?? []) {
      if (!c.custom_id?.startsWith("roles:")) continue;
      const { roleId, pickOne, excluded } = parseId(c.custom_id);
      const emoji = c.emoji?.id ? `<${c.emoji.animated ? "a" : ""}:${c.emoji.name}:${c.emoji.id}>` : c.emoji?.name ?? undefined;
      out.push({ roleId, label: c.label ?? "", emoji, style: c.style, pickOne, excluded });
    }
  }
  return out;
}

/** Reads a panel back into editable text. */
export function readPanel(message: Message) {
  const buttons = panelButtons(message);
  const embed = message.embeds[0];
  const lines = (embed?.description ?? "").split("\n");
  const notes = new Map<string, string>();
  let firstRoleLine = lines.length;
  lines.forEach((line, i) => {
    const m = line.match(/^\S+ <@&(\d+)>(?: — (.*))?$/);
    if (m) { notes.set(m[1], m[2] ?? ""); firstRoleLine = Math.min(firstRoleLine, i); }
  });
  let description = lines.slice(0, firstRoleLine).join("\n").trim();
  if (DEFAULT_TEXTS.includes(description)) description = "";
  const styles = new Set(buttons.map((b) => b.style));
  const guild = message.guild!;
  return {
    title: embed?.title ?? "Pick your roles",
    description,
    roles: buttons.map((b) => [guild.roles.cache.get(b.roleId)?.name ?? b.label, b.emoji ?? "", notes.get(b.roleId) ?? ""]
      .join(" | ").replace(/( \| )+$/, "")).join("\n"),
    color: styles.size === 1 ? STYLE_NAMES[buttons[0].style] ?? "grey" : "mix",
    settings: `pick one: ${buttons[0]?.pickOne ? "yes" : "no"}; exclude: ${(buttons[0]?.excluded ?? [])
      .map((id) => guild.roles.cache.get(id)?.name ?? id).join(", ")}`,
  };
}

function findRole(guild: Guild, text: string): Role | undefined {
  const t = text.trim().replace(/^@/, "");
  const id = t.match(/^<@&(\d+)>$/)?.[1] ?? (/^\d{15,20}$/.test(t) ? t : null);
  if (id) return guild.roles.cache.get(id);
  return guild.roles.cache.find((r) => r.name.toLowerCase() === t.toLowerCase());
}

async function fetchPanel(interaction: { guild: Guild | null; client: { user: { id: string } } }, channelId: string, messageId: string): Promise<Message> {
  const channel = interaction.guild?.channels.cache.get(channelId);
  const message = channel?.isTextBased() ? await channel.messages.fetch(messageId).catch(() => null) : null;
  if (!message) throw new UserError("I couldn't find that role panel anymore.");
  return message;
}

export const editRolePanel: MessageMenu = {
  data: new ContextMenuCommandBuilder()
    .setName("Edit role panel")
    .setType(ApplicationCommandType.Message)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    const message = interaction.targetMessage;
    if (message.author.id !== interaction.client.user.id || !panelButtons(message).length) {
      throw new UserError("That isn't one of my role panels. Right-click a panel posted with `/roles`.");
    }
    const cur = readPanel(message);
    const field = (id: string, label: string, style: TextInputStyle, value: string, max: number, required: boolean, placeholder?: string) => {
      const input = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setMaxLength(max).setRequired(required);
      if (value) input.setValue(value.slice(0, max));
      if (placeholder) input.setPlaceholder(placeholder);
      return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
    };
    await interaction.showModal(new ModalBuilder()
      .setCustomId(`roles:edit:${message.channelId}:${message.id}`)
      .setTitle("Edit role panel")
      .addComponents(
        field("title", "Title", TextInputStyle.Short, cur.title, 200, true),
        field("description", "Description (empty = default text)", TextInputStyle.Paragraph, cur.description, 1000, false),
        field("roles", "Roles: one per line, Name | emoji | note", TextInputStyle.Paragraph, cur.roles, 4000, true, "Gamer | 🎮 | Pinged for game nights"),
        field("color", "Button color: red, blurple, green, grey, mix", TextInputStyle.Short, cur.color, 10, true),
        field("settings", "Settings", TextInputStyle.Short, cur.settings, 300, false, "pick one: no; exclude: Muted, Unverified"),
      ));
  },
};

roles.handleModal = async (interaction) => {
  const [, kind, channelId, messageId] = interaction.customId.split(":");
  if (kind !== "edit") return;
  const guild = interaction.guild!;
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) throw new UserError("Editing role panels needs Manage Roles.");
  const message = await fetchPanel(interaction, channelId, messageId);
  const me = await guild.members.fetchMe();
  const get = (id: string) => interaction.fields.getTextInputValue(id).trim();

  const unknown: string[] = [];
  const rolesList: PanelSpec["roles"] = [];
  for (const line of get("roles").split("\n").map((l) => l.trim()).filter(Boolean)) {
    const [name, emoji, ...rest] = line.split("|").map((p) => p.trim());
    const role = findRole(guild, name);
    if (!role) { unknown.push(name); continue; }
    if (!rolesList.some((r) => r.role.id === role.id)) rolesList.push({ role, emoji: emoji || undefined, note: rest.join(" | ") || undefined });
  }
  if (unknown.length) throw new UserError(`I couldn't find these roles: ${unknown.join(", ")}. Use the exact role name.`);
  const problems = rolesList.map((r) => checkRole(r.role, me)).filter(Boolean);
  if (problems.length) throw new UserError(problems.join("\n"));

  const settings = get("settings");
  const pickOne = /pick\s*one\s*:\s*(yes|y|true|on)\b/i.test(settings);
  const excludeText = settings.match(/exclude\s*:\s*([^;]*)/i)?.[1] ?? "";
  const excluded: string[] = [];
  for (const name of excludeText.split(",").map((n) => n.trim()).filter(Boolean)) {
    const role = findRole(guild, name);
    if (!role) throw new UserError(`I couldn't find the excluded role "${name}".`);
    if (!excluded.includes(role.id)) excluded.push(role.id);
  }

  const { embed, rows } = buildPanel(guild, {
    title: get("title"), description: get("description") || undefined, roles: rolesList,
    color: get("color").toLowerCase(), pickOne, excluded,
  });
  await message.edit({ embeds: [embed], components: rows });
  await interaction.reply({ content: `Updated the role panel: ${message.url}`, flags: MessageFlags.Ephemeral });
};
