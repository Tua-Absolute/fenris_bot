import type { Client, Message } from "discord.js";
import { claudeAllowedIn } from "../config.js";
import { formatBirthday, getBirthday, removeBirthday, setBirthday, validDate } from "../lib/birthdays.js";
import { readBirthdayIntent } from "../lib/birthdayParse.js";
import { getSettings } from "../lib/settings.js";

const COOLDOWN_MS = 5_000;
const lastAsked = new Map<string, number>();
const EXAMPLES = "Try `@Fenris my birthday is March 3` (or `3/3`), or `@Fenris forget my birthday`.";

/**
 * In servers where Claude is off, mentioning Fenris still lets members save their own birthday.
 * It only ever changes the author's own birthday, so it needs no permissions and no slash commands.
 */
async function onMessage(message: Message, client: Client<true>) {
  if (message.author.bot || !message.inGuild() || claudeAllowedIn(message.guildId)) return;
  const botId = client.user.id;
  const replyToBot = message.mentions.repliedUser?.id === botId;
  if (!message.mentions.users.has(botId) && !replyToBot) return;

  const intent = readBirthdayIntent(message.content, replyToBot);
  // A plain reply to one of Fenris's posts ("thanks!") isn't a question, so stay quiet.
  if (intent.kind === "none" && !message.mentions.users.has(botId)) return;

  const now = Date.now();
  if (now - (lastAsked.get(message.author.id) ?? 0) < COOLDOWN_MS) return;
  lastAsked.set(message.author.id, now);

  const guildId = message.guild.id;
  let text: string;
  switch (intent.kind) {
    case "set": {
      if (!validDate(intent.month, intent.day)) { text = `Hmm, that date doesn't exist. ${EXAMPLES}`; break; }
      await setBirthday(guildId, message.author.id, { month: intent.month, day: intent.day });
      const ch = getSettings(guildId).birthdayChannelId;
      text = `🎂 Saved your birthday as **${formatBirthday(intent)}**.${ch ? ` I'll celebrate in <#${ch}> on the day!` : ""}\nWrong date? Just tell me again.`;
      break;
    }
    case "remove":
      text = (await removeBirthday(guildId, message.author.id)) ? "🗑️ Your birthday is removed." : "You didn't have a birthday saved.";
      break;
    case "show": {
      const b = getBirthday(guildId, message.author.id);
      text = b ? `🎂 I have your birthday as **${formatBirthday(b)}**.` : `I don't have your birthday yet. ${EXAMPLES}`;
      break;
    }
    case "unclear":
      text = `I couldn't find a date in that. ${EXAMPLES}`;
      break;
    default:
      text = `🐺 Hi! Here I can save your birthday so I can celebrate it. ${EXAMPLES}`;
  }
  await message.reply({ content: text, allowedMentions: { repliedUser: false, parse: [] } }).catch(() => {});
}

export function registerBirthdayPing(client: Client) {
  client.on("messageCreate", (message) => {
    if (!client.isReady()) return;
    onMessage(message, client).catch((e) => console.error("Birthday ping failed:", e));
  });
}
