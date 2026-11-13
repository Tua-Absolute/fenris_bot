import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags,
  type ButtonInteraction,
  type Client,
  type Message,
} from "discord.js";
import { randomUUID } from "node:crypto";
import { claudeAllowedIn, config } from "../config.js";
import { UserError } from "../lib/files.js";
import { execute, preview, requiredPermission, type Action } from "./actions.js";
import { askClaude } from "./claude.js";
import { takeQuota } from "./quota.js";
import { formatBirthday, removeBirthday, setBirthday, validDate } from "../lib/birthdays.js";
import { getSettings } from "../lib/settings.js";

const COOLDOWN_MS = 8_000;
const HISTORY = 20;
const CATCHUP_HISTORY = 100;
const CATCHUP = /\b(catch (me )?up|what did i miss|what'?s been happening|summar(y|ize|ise)|tl;?dr|recap)\b/i;
const PENDING_TTL_MS = 15 * 60_000;

const lastAsked = new Map<string, number>();

const pending = new Map<string, { action: Action; userId: string; expires: number }>();

function localNow(): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: config.timezone(), dateStyle: "full", timeStyle: "short",
  }).format(new Date());
}

async function buildContext(message: Message<true>, botId: string): Promise<string> {
  const guild = message.guild;
  const catchup = CATCHUP.test(message.cleanContent);
  const earlier = await message.channel.messages.fetch({ limit: catchup ? CATCHUP_HISTORY : HISTORY, before: message.id });
  const transcript = [...earlier.values()].reverse().map((m) => {
    const who = m.author.id === botId ? "Fenris (you)" : (m.member?.displayName ?? m.author.username);
    const embedText = m.embeds.map((e) => `[embed: ${e.title ?? ""}]`).join(" ");
    return `${who}: ${(m.cleanContent || embedText || "[attachment]").slice(0, catchup ? 300 : 600)}`;
  }).join("\n");

  const text = guild.channels.cache
    .filter((c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement)
    .map((c) => `#${c.name} (id ${c.id})`).join(", ");
  const voice = guild.channels.cache
    .filter((c) => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice)
    .map((c) => `${c.name} (id ${c.id})`).join(", ");

  const asker = message.member?.displayName ?? message.author.username;
  const faq = getSettings(guild.id).faq;
  return [
    `Server: ${guild.name}`,
    `Current channel: #${"name" in message.channel ? message.channel.name : "?"} (id ${message.channel.id})`,
    `Server local time: ${localNow()} (${config.timezone()})`,
    `Text channels: ${text}`,
    `Voice channels: ${voice || "none"}`,
    ...(faq ? ["", "Server FAQ and facts from the admins (trust these and use them to answer questions about the server):", faq] : []),
    "",
    "Recent messages in this channel (oldest first):",
    transcript || "(none)",
    "",
    `${asker} is talking to you now:`,
    message.cleanContent.slice(0, 2000),
  ].join("\n");
}

function chunks(text: string, size = 1900): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

async function onMessage(message: Message, client: Client<true>) {
  if (message.author.bot || !message.inGuild()) return;
  // Claude only runs in your own server(s), so other servers can't spend your API credit.
  if (!claudeAllowedIn(message.guildId)) return;
  const botId = client.user.id;
  const pinged = message.mentions.users.has(botId) || message.mentions.repliedUser?.id === botId;
  if (!pinged) return;

  const now = Date.now();
  if (now - (lastAsked.get(message.author.id) ?? 0) < COOLDOWN_MS) {
    await message.react("⏳").catch(() => {});
    return;
  }
  if (!takeQuota()) {
    await message.reply("I've hit today's chat limit for this server. I'll be back tomorrow!");
    return;
  }
  lastAsked.set(message.author.id, now);

  await message.channel.sendTyping().catch(() => {});
  try {
    const result = await askClaude(await buildContext(message, botId));

    if (result.birthday) {
      // Only ever the author's own birthday, so no permission check or Confirm button is needed.
      const b = result.birthday;
      let note: string;
      if (b.remove) {
        note = (await removeBirthday(message.guild.id, message.author.id)) ? "🗑️ Your birthday is removed." : "You didn't have a birthday saved.";
      } else if (!validDate(b.month, b.day)) {
        note = "Hmm, that date doesn't exist. Could you tell me the month and day again?";
      } else {
        await setBirthday(message.guild.id, message.author.id, { month: b.month, day: b.day });
        const ch = getSettings(message.guild.id).birthdayChannelId;
        note = `🎂 Saved your birthday as **${formatBirthday(b)}**.${ch ? ` I'll celebrate in <#${ch}> on the day!` : ""}`;
      }
      await message.reply({ content: `${result.text ? `${result.text}\n` : ""}${note}`.slice(0, 2000), allowedMentions: { repliedUser: false, parse: [] } });
      if (!result.action) return;
    }

    if (!result.action) {
      const parts = chunks(result.text || "🐺");
      for (const [i, part] of parts.entries()) {
        if (i === 0) await message.reply({ content: part, allowedMentions: { repliedUser: false, parse: [] } });
        else await message.channel.send({ content: part, allowedMentions: { parse: [] } });
      }
      return;
    }

    const need = requiredPermission[result.action.kind];
    if (!message.member?.permissions.has(need.flag)) {
      await message.reply(`I'd love to, but that needs the **${need.label}** permission, which you don't have here.`);
      return;
    }

    const { summary, embed, files } = await preview(message.guild, result.action);
    const id = randomUUID();
    for (const [key, p] of pending) if (p.expires < now) pending.delete(key);
    pending.set(id, { action: result.action, userId: message.author.id, expires: now + PENDING_TTL_MS });

    await message.reply({
      content: `${result.text ? result.text + "\n" : ""}${summary}`.slice(0, 2000),
      embeds: [embed],
      files,
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`chat:confirm:${id}`).setLabel("Confirm").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`chat:cancel:${id}`).setLabel("Cancel").setStyle(ButtonStyle.Secondary),
      )],
      allowedMentions: { repliedUser: false, parse: [] },
    });
  } catch (error) {
    const text = error instanceof UserError ? error.message : "Something went wrong on my end. Try again in a bit.";
    if (!(error instanceof UserError)) console.error("chat failed:", error);
    await message.reply(text).catch(() => {});
  }
}

export async function handleChatButton(interaction: ButtonInteraction) {
  const [, choice, id] = interaction.customId.split(":");
  const p = pending.get(id);
  if (!p) {
    await interaction.reply({ content: "That proposal expired. Just ask me again.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (interaction.user.id !== p.userId) {
    await interaction.reply({ content: "Only the person who asked can confirm this.", flags: MessageFlags.Ephemeral });
    return;
  }
  pending.delete(id);

  if (choice === "cancel") {
    await interaction.update({ content: "Cancelled. Nothing was posted.", embeds: [], components: [], attachments: [] });
    return;
  }

  await interaction.deferUpdate();
  try {
    const result = await execute(interaction.guild!, p.action, interaction.user.id);
    await interaction.editReply({ content: result, components: [] });
  } catch (error) {
    const text = error instanceof UserError ? error.message : "Discord wouldn't let me do that. Check my permissions in that channel.";
    if (!(error instanceof UserError)) console.error("chat action failed:", error);
    await interaction.editReply({ content: text, components: [] });
  }
}

export function registerChat(client: Client) {
  client.on("messageCreate", (message) => {
    if (client.isReady()) void onMessage(message, client);
  });
}
