// Support tickets: a panel button opens a private channel between the member and the staff role.
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags,
  ModalBuilder,
  OverwriteType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Guild,
  type GuildMember,
  type GuildTextBasedChannel,
  type TextChannel,
} from "discord.js";
import { messagesSince } from "../ai/transcript.js";
import { brandEmbed, colors, discordTime } from "../lib/brand.js";
import { UserError } from "../lib/files.js";
import { modLog } from "../lib/modlog.js";
import { getSettings } from "../lib/settings.js";
import { JsonStore } from "../lib/store.js";
import type { Command } from "./types.js";

interface Ticket { guildId: string; userId: string; number: number; topic: string; openedAt: number }
const store = new JsonStore<{ tickets: Record<string, Ticket>; counters: Record<string, number> }>("tickets", { tickets: {}, counters: {} });

const P = PermissionFlagsBits;
const MEMBER_PERMS = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks];

function isStaff(member: GuildMember): boolean {
  const role = getSettings(member.guild.id).ticketStaffRoleId;
  return member.permissions.has(P.ManageChannels) || (!!role && member.roles.cache.has(role));
}

const closeRow = () => new ActionRowBuilder<ButtonBuilder>().addComponents(
  new ButtonBuilder().setCustomId("ticket:close").setLabel("Close ticket").setEmoji("🔒").setStyle(ButtonStyle.Danger));

async function openTicket(guild: Guild, member: GuildMember, topic: string): Promise<TextChannel> {
  const s = getSettings(guild.id);
  if (!s.ticketCategoryId || !s.ticketStaffRoleId) throw new UserError("Tickets aren't set up yet. An admin can run `/settings tickets`.");
  const existing = Object.entries(store.data.tickets).find(([, t]) => t.guildId === guild.id && t.userId === member.id);
  if (existing && guild.channels.cache.has(existing[0])) throw new UserError(`You already have an open ticket: <#${existing[0]}>`);
  if (existing) delete store.data.tickets[existing[0]]; // its channel was deleted by hand

  const number = (store.data.counters[guild.id] = (store.data.counters[guild.id] ?? 0) + 1);
  const name = `ticket-${String(number).padStart(4, "0")}-${member.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 90);
  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: s.ticketCategoryId,
    topic: `Ticket #${number} for ${member.user.tag}: ${topic}`.slice(0, 1024),
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [P.ViewChannel] },
      { id: member.id, type: OverwriteType.Member, allow: MEMBER_PERMS },
      { id: s.ticketStaffRoleId, allow: [...MEMBER_PERMS, P.ManageMessages] },
      { id: guild.client.user.id, type: OverwriteType.Member, allow: [...MEMBER_PERMS, P.ManageChannels] },
    ],
  }).catch((e) => {
    console.error("Ticket channel create failed:", e);
    throw new UserError("I couldn't create the ticket channel. I need Manage Channels in the ticket category.");
  });
  store.data.tickets[channel.id] = { guildId: guild.id, userId: member.id, number, topic, openedAt: Date.now() };
  await store.save();

  await channel.send({
    content: `<@${member.id}> <@&${s.ticketStaffRoleId}>`,
    embeds: [brandEmbed(colors.red).setTitle(`🎫 Ticket #${number}`)
      .setDescription(`**From:** <@${member.id}>\n**About:** ${topic}\n\nA staff member will be with you soon. Add any details or screenshots here. Anyone can close this with the button below.`)],
    components: [closeRow()],
    allowedMentions: { users: [member.id], roles: [s.ticketStaffRoleId] },
  });
  await modLog(guild, brandEmbed(colors.blue).setTitle("🎫 Ticket opened")
    .setDescription(`**#${number}** by <@${member.id}> in <#${channel.id}>\n**About:** ${topic}`));
  return channel;
}

async function closeTicket(channel: GuildTextBasedChannel, closedBy: string, reason?: string) {
  const ticket = store.data.tickets[channel.id];
  if (!ticket) throw new UserError("This isn't an open ticket channel.");
  const msgs = await messagesSince(channel, ticket.openedAt - 60_000, 1000);
  const log = msgs.map((m) => `[${new Date(m.createdTimestamp).toISOString().slice(0, 16).replace("T", " ")}] ${m.author.tag}: ${m.cleanContent}` +
    (m.attachments.size ? ` [files: ${m.attachments.map((a) => a.url).join(" ")}]` : "") +
    (m.embeds.length ? ` [embed: ${m.embeds.map((e) => e.title ?? "").join(", ")}]` : "")).join("\n");
  const file = () => new AttachmentBuilder(Buffer.from(log || "(no messages)", "utf8"), { name: `ticket-${ticket.number}.txt` });

  const summary = brandEmbed(colors.white).setTitle(`🔒 Ticket #${ticket.number} closed`).setDescription(
    `**Opened by:** <@${ticket.userId}> ${discordTime(new Date(ticket.openedAt), "R")}\n**Closed by:** <@${closedBy}>\n**About:** ${ticket.topic}` +
    (reason ? `\n**Reason:** ${reason}` : "") + `\n**Messages:** ${msgs.length}`);
  const guild = channel.guild;
  const logId = getSettings(guild.id).modLogChannelId;
  const logCh = logId ? guild.channels.cache.get(logId) : undefined;
  if (logCh?.isTextBased()) await (logCh as GuildTextBasedChannel).send({ embeds: [summary], files: [file()] }).catch(() => {});
  const user = await guild.client.users.fetch(ticket.userId).catch(() => null);
  await user?.send({ content: `Your ticket in **${guild.name}** was closed. Here's a copy of the conversation.`, embeds: [summary], files: [file()] }).catch(() => {});

  delete store.data.tickets[channel.id];
  await store.save();
  await channel.send({ embeds: [brandEmbed(colors.white).setDescription("🔒 Closing this ticket in 5 seconds…")] });
  setTimeout(() => void channel.delete(`Ticket closed by ${closedBy}`).catch((e) => console.error("Ticket delete failed:", e.message)), 5000);
}

export const ticket: Command = {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Support tickets.")
    .addSubcommand((s) => s.setName("panel").setDescription("Post the \"Open a ticket\" button in this channel (admins).")
      .addStringOption((o) => o.setName("title").setDescription("Panel title").setMaxLength(100))
      .addStringOption((o) => o.setName("description").setDescription("Panel text").setMaxLength(1000)))
    .addSubcommand((s) => s.setName("open").setDescription("Open a private ticket with the staff.")
      .addStringOption((o) => o.setName("topic").setDescription("What do you need help with?").setRequired(true).setMaxLength(200)))
    .addSubcommand((s) => s.setName("close").setDescription("Close this ticket.")
      .addStringOption((o) => o.setName("reason").setDescription("Why (optional)").setMaxLength(300)))
    .addSubcommand((s) => s.setName("add").setDescription("Add someone to this ticket.")
      .addUserOption((o) => o.setName("user").setDescription("Who").setRequired(true))),

  async execute(interaction) {
    const guild = interaction.guild!;
    const member = await guild.members.fetch(interaction.user.id);
    const sub = interaction.options.getSubcommand();

    if (sub === "panel") {
      if (!member.permissions.has(P.ManageGuild)) throw new UserError("Posting the panel needs Manage Server.");
      const s = getSettings(guild.id);
      if (!s.ticketCategoryId || !s.ticketStaffRoleId) throw new UserError("Run `/settings tickets` first to pick a category and staff role.");
      await (interaction.channel as GuildTextBasedChannel).send({
        embeds: [brandEmbed(colors.red).setTitle(interaction.options.getString("title") ?? "🎫 Need help?")
          .setDescription(interaction.options.getString("description") ?? "Click the button below to open a private ticket with the staff team. Only you and the staff can see it.")],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId("ticket:open").setLabel("Open a ticket").setEmoji("🎫").setStyle(ButtonStyle.Primary))],
      });
      await interaction.reply({ content: "Ticket panel posted.", flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === "open") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const ch = await openTicket(guild, member, interaction.options.getString("topic", true));
      await interaction.editReply(`Your ticket is open: <#${ch.id}>`);
      return;
    }

    const channel = interaction.channel as GuildTextBasedChannel;
    const t = store.data.tickets[channel.id];
    if (!t) throw new UserError("Use this inside a ticket channel.");
    if (sub === "close") {
      if (t.userId !== member.id && !isStaff(member)) throw new UserError("Only the ticket owner or staff can close it.");
      await interaction.reply({ content: "Closing…", flags: MessageFlags.Ephemeral });
      await closeTicket(channel, member.id, interaction.options.getString("reason") ?? undefined);
      return;
    }

    // add
    if (!isStaff(member)) throw new UserError("Only staff can add people to a ticket.");
    const user = interaction.options.getUser("user", true);
    await (channel as TextChannel).permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true });
    await interaction.reply({ content: `Added <@${user.id}> to this ticket.`, allowedMentions: { users: [user.id] } });
  },

  async handleButton(interaction: ButtonInteraction) {
    const action = interaction.customId.split(":")[1];
    if (action === "open") {
      await interaction.showModal(new ModalBuilder().setCustomId("ticket:form").setTitle("Open a ticket").addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("topic")
          .setLabel("What do you need help with?").setStyle(TextInputStyle.Paragraph).setMaxLength(500).setRequired(true))));
      return;
    }
    const channel = interaction.channel as GuildTextBasedChannel;
    const t = store.data.tickets[channel.id];
    if (!t) throw new UserError("This ticket is already closed.");
    const member = await interaction.guild!.members.fetch(interaction.user.id);
    if (t.userId !== member.id && !isStaff(member)) throw new UserError("Only the ticket owner or staff can close it.");
    if (action === "close") {
      await interaction.reply({
        content: "Close this ticket? The channel will be deleted and a transcript saved.",
        flags: MessageFlags.Ephemeral,
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId("ticket:confirmclose").setLabel("Yes, close it").setStyle(ButtonStyle.Danger))],
      });
      return;
    }
    if (action === "confirmclose") {
      await interaction.update({ content: "Closing…", components: [] });
      await closeTicket(channel, member.id);
    }
  },

  async handleModal(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const member = await interaction.guild!.members.fetch(interaction.user.id);
    const ch = await openTicket(interaction.guild!, member, interaction.fields.getTextInputValue("topic"));
    await interaction.editReply(`Your ticket is open: <#${ch.id}>`);
  },
};
