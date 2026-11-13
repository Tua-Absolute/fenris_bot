// Rules gate: post the rules with an "I agree" button. Agreeing removes the intro role and gives the member role.
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type GuildTextBasedChannel,
} from "discord.js";
import { brandEmbed, colors } from "../lib/brand.js";
import { UserError } from "../lib/files.js";
import { modLog } from "../lib/modlog.js";
import { getSettings, updateSettings, type GuildSettings } from "../lib/settings.js";
import type { Command } from "./types.js";

type Rules = NonNullable<GuildSettings["rules"]>;
const pending = new Map<string, Omit<Rules, "text" | "messageId"> & { expires: number }>();

const EXAMPLE = "1. Be kind. No harassment, hate speech, or bullying.\n2. No spam or self-promotion without permission.\n3. Keep content in the right channels.\n4. No NSFW content.\n5. Listen to the mods.";

function rulesMessage(r: Rules) {
  return {
    embeds: [brandEmbed(colors.red).setTitle(r.title).setDescription(
      `${r.text}\n\n**Click the button below to agree and unlock the server.** 🐺`.slice(0, 4096))],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("rules:agree").setLabel("I agree to the rules").setEmoji("✅").setStyle(ButtonStyle.Success))],
  };
}

export const rules: Command = {
  data: new SlashCommandBuilder()
    .setName("rules")
    .setDescription("Post the server rules with an \"I agree\" button that unlocks the server.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName("post").setDescription("Post (or update) the rules. A form opens for the rules text.")
      .addChannelOption((o) => o.setName("channel").setDescription("Rules channel").setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addRoleOption((o) => o.setName("member_role").setDescription("Role given when someone agrees (unlocks the server)").setRequired(true))
      .addRoleOption((o) => o.setName("intro_role").setDescription("Role taken away when someone agrees (e.g. your safety/intro role)"))
      .addStringOption((o) => o.setName("title").setDescription("Title (default: 📜 Server Rules)").setMaxLength(200)))
    .addSubcommand((s) => s.setName("view").setDescription("Show the current rules setup.")),

  async execute(interaction) {
    const guild = interaction.guild!;
    const saved = getSettings(guild.id).rules;

    if (interaction.options.getSubcommand() === "view") {
      await interaction.reply({
        content: saved
          ? `📜 Rules are in <#${saved.channelId}>. Agreeing gives <@&${saved.memberRoleId}>${saved.introRoleId ? ` and removes <@&${saved.introRoleId}>` : ""}.`
          : "No rules posted yet. Use `/rules post`.",
        flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] },
      });
      return;
    }

    const memberRole = interaction.options.getRole("member_role", true);
    const introRole = interaction.options.getRole("intro_role");
    const me = await guild.members.fetchMe();
    for (const r of [memberRole, introRole]) {
      if (!r) continue;
      if (r.id === guild.id) throw new UserError("@everyone can't be used here.");
      if (me.roles.highest.comparePositionTo(r.id) <= 0) throw new UserError(`<@&${r.id}> is above my highest role. Drag my role above it in Server Settings > Roles.`);
    }
    if (introRole?.id === memberRole.id) throw new UserError("The member role and intro role must be different.");

    for (const [k, p] of pending) if (p.expires < Date.now()) pending.delete(k);
    pending.set(interaction.id, {
      channelId: interaction.options.getChannel("channel", true).id,
      memberRoleId: memberRole.id,
      introRoleId: introRole?.id,
      title: interaction.options.getString("title") ?? saved?.title ?? "📜 Server Rules",
      expires: Date.now() + 15 * 60_000,
    });
    await interaction.showModal(new ModalBuilder().setCustomId(`rules:form:${interaction.id}`).setTitle("Server rules").addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("text").setLabel("Rules (Discord formatting works)")
        .setStyle(TextInputStyle.Paragraph).setMaxLength(3800).setRequired(true).setValue(saved?.text ?? EXAMPLE))));
  },

  async handleModal(interaction) {
    const p = pending.get(interaction.customId.split(":")[2]);
    if (!p) throw new UserError("That form expired. Run `/rules post` again.");
    pending.delete(interaction.customId.split(":")[2]);
    const guild = interaction.guild!;
    const saved = getSettings(guild.id).rules;
    const r: Rules = { ...p, text: interaction.fields.getTextInputValue("text"), messageId: undefined };
    delete (r as Partial<typeof p>).expires;

    const channel = guild.channels.cache.get(r.channelId) as GuildTextBasedChannel | undefined;
    if (!channel) throw new UserError("I can't find that channel.");
    // Update the existing rules post in place when it's in the same channel; otherwise post a new one.
    const old = saved?.messageId && saved.channelId === r.channelId ? await channel.messages.fetch(saved.messageId).catch(() => null) : null;
    const msg = old ? await old.edit(rulesMessage(r)) : await channel.send(rulesMessage(r));
    r.messageId = msg.id;
    await updateSettings(guild.id, { rules: r });
    const auto = getSettings(guild.id).autoRoleId;
    await interaction.reply({
      content: `📜 Rules ${old ? "updated" : "posted"}: ${msg.url}` +
        (r.introRoleId && auto !== r.introRoleId ? `\nTip: to give new members <@&${r.introRoleId}> automatically when they join, run \`/settings welcome auto_role:\` with it.` : ""),
      flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] },
    });
  },

  async handleButton(interaction) {
    const guild = interaction.guild!;
    const r = getSettings(guild.id).rules;
    if (!r) throw new UserError("The rules aren't set up anymore. Ask a moderator.");
    const member = await guild.members.fetch(interaction.user.id);
    const hasMember = member.roles.cache.has(r.memberRoleId);
    const hasIntro = !!r.introRoleId && member.roles.cache.has(r.introRoleId);
    if (hasMember && !hasIntro) {
      await interaction.reply({ content: "You've already agreed to the rules. Welcome! 🐺", flags: MessageFlags.Ephemeral });
      return;
    }
    try {
      if (!hasMember) await member.roles.add(r.memberRoleId, "Agreed to the rules");
      if (hasIntro) await member.roles.remove(r.introRoleId!, "Agreed to the rules");
    } catch (e) {
      console.error("Rules role change failed:", e);
      throw new UserError("I couldn't update your roles. Please tell a moderator (my role may need to be higher).");
    }
    await interaction.reply({ content: "✅ Thanks for agreeing! The server is unlocked. Welcome to the pack! 🐺", flags: MessageFlags.Ephemeral });
    await modLog(guild, brandEmbed(colors.green).setDescription(`📜 <@${member.id}> agreed to the rules.`));
  },
};
