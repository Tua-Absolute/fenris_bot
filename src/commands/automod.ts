// Sets up Discord's built-in AutoMod rules. Discord itself enforces them, even if the bot is offline.
import {
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleKeywordPresetType,
  AutoModerationRuleTriggerType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type AutoModerationActionOptions,
  type AutoModerationRuleCreateOptions,
  type Guild,
} from "discord.js";
import { brandEmbed, colors } from "../lib/brand.js";
import { getSettings } from "../lib/settings.js";
import type { Command } from "./types.js";

const PREFIX = "Fenris: ";
const names = {
  invites: `${PREFIX}Invite links`,
  words: `${PREFIX}Blocked words`,
  filter: `${PREFIX}Profanity & slurs`,
  spam: `${PREFIX}Spam`,
  mentions: `${PREFIX}Mention spam`,
} as const;
type RuleKey = keyof typeof names;

function actions(guild: Guild, message: string): AutoModerationActionOptions[] {
  const list: AutoModerationActionOptions[] = [{ type: AutoModerationActionType.BlockMessage, metadata: { customMessage: message } }];
  const log = getSettings(guild.id).modLogChannelId;
  if (log) list.push({ type: AutoModerationActionType.SendAlertMessage, metadata: { channel: log } });
  return list;
}

function ruleFor(guild: Guild, key: RuleKey, words?: string[], mentionLimit?: number): AutoModerationRuleCreateOptions {
  const base = { name: names[key], eventType: AutoModerationRuleEventType.MessageSend, enabled: true };
  switch (key) {
    case "invites":
      return { ...base, triggerType: AutoModerationRuleTriggerType.Keyword,
        triggerMetadata: { regexPatterns: ["(discord\\.(gg|io|me|li)|discord(app)?\\.com/invite)/\\S+"] },
        actions: actions(guild, "Invite links to other servers aren't allowed here.") };
    case "words":
      return { ...base, triggerType: AutoModerationRuleTriggerType.Keyword,
        triggerMetadata: { keywordFilter: words ?? [] },
        actions: actions(guild, "That message has a word that's blocked here.") };
    case "filter":
      return { ...base, triggerType: AutoModerationRuleTriggerType.KeywordPreset,
        triggerMetadata: { presets: [AutoModerationRuleKeywordPresetType.Profanity, AutoModerationRuleKeywordPresetType.Slurs, AutoModerationRuleKeywordPresetType.SexualContent] },
        actions: actions(guild, "Let's keep it clean. 🐺") };
    case "spam":
      return { ...base, triggerType: AutoModerationRuleTriggerType.Spam, actions: actions(guild, "That looked like spam.") };
    case "mentions":
      return { ...base, triggerType: AutoModerationRuleTriggerType.MentionSpam,
        triggerMetadata: { mentionTotalLimit: mentionLimit ?? 5, mentionRaidProtectionEnabled: true },
        actions: actions(guild, "Too many mentions in one message.") };
  }
}

async function fenrisRules(guild: Guild) {
  const rules = await guild.autoModerationRules.fetch();
  return rules.filter((r) => r.name.startsWith(PREFIX));
}

/** Creates or updates a rule; returns a line for the reply. */
async function upsert(guild: Guild, key: RuleKey, words?: string[], mentionLimit?: number): Promise<string> {
  const existing = (await fenrisRules(guild)).find((r) => r.name === names[key]);
  const options = ruleFor(guild, key, words, mentionLimit);
  try {
    if (existing) {
      const { triggerType: _t, ...edit } = options;
      await existing.edit(edit);
    } else {
      await guild.autoModerationRules.create(options);
    }
    return `✅ ${names[key].slice(PREFIX.length)}`;
  } catch (e) {
    const msg = (e as Error).message;
    // Discord allows only one spam, one preset, and one mention-spam rule per server.
    if (/maximum|limit/i.test(msg)) return `⚠️ ${names[key].slice(PREFIX.length)}: this server already has a rule of that kind (check Server Settings > AutoMod).`;
    return `⚠️ ${names[key].slice(PREFIX.length)}: ${msg}`;
  }
}

async function remove(guild: Guild, key: RuleKey): Promise<string> {
  const existing = (await fenrisRules(guild)).find((r) => r.name === names[key]);
  if (existing) await existing.delete("Turned off with /automod");
  return `➖ ${names[key].slice(PREFIX.length)} off`;
}

export const automod: Command = {
  data: new SlashCommandBuilder()
    .setName("automod")
    .setDescription("Set up Discord's AutoMod to block spam, invites, and bad words automatically.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName("setup").setDescription("Turn protections on or off. Leave an option empty to keep it as it is.")
      .addBooleanOption((o) => o.setName("filter").setDescription("Block profanity, slurs, and sexual content (Discord's word lists)"))
      .addBooleanOption((o) => o.setName("invites").setDescription("Block invite links to other Discord servers"))
      .addBooleanOption((o) => o.setName("spam").setDescription("Block messages Discord detects as spam"))
      .addIntegerOption((o) => o.setName("mention_limit").setDescription("Block messages with more than this many mentions (0 = off)").setMinValue(0).setMaxValue(50))
      .addStringOption((o) => o.setName("words").setDescription("Your own blocked words, comma separated. *word* matches inside words. Type off to remove.").setMaxLength(1000)))
    .addSubcommand((s) => s.setName("status").setDescription("Show which protections are on."))
    .addSubcommand((s) => s.setName("off").setDescription("Remove all of Fenris's AutoMod rules.")),

  async execute(interaction) {
    const guild = interaction.guild!;
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (sub === "status") {
      const rules = await fenrisRules(guild);
      const log = getSettings(guild.id).modLogChannelId;
      await interaction.editReply({ embeds: [brandEmbed(colors.red).setTitle("🛡️ AutoMod").setDescription(
        (rules.size ? rules.map((r) => `${r.enabled ? "✅" : "⏸️"} ${r.name.slice(PREFIX.length)}`).join("\n") : "No Fenris rules yet. Use `/automod setup`.") +
        `\n\nAlerts go to: ${log ? `<#${log}>` : "nowhere (set one with `/settings modlog`)"}`)] });
      return;
    }

    if (sub === "off") {
      const rules = await fenrisRules(guild);
      await Promise.all(rules.map((r) => r.delete("Turned off with /automod off")));
      await interaction.editReply(`Removed ${rules.size} AutoMod rule${rules.size === 1 ? "" : "s"}.`);
      return;
    }

    const lines: string[] = [];
    for (const key of ["filter", "invites", "spam"] as const) {
      const on = interaction.options.getBoolean(key);
      if (on !== null) lines.push(on ? await upsert(guild, key) : await remove(guild, key));
    }
    const limit = interaction.options.getInteger("mention_limit");
    if (limit !== null) lines.push(limit > 0 ? await upsert(guild, "mentions", undefined, limit) : await remove(guild, "mentions"));
    const words = interaction.options.getString("words");
    if (words !== null) {
      const list = words.split(",").map((w) => w.trim()).filter(Boolean).slice(0, 1000);
      lines.push(words.trim().toLowerCase() === "off" || !list.length ? await remove(guild, "words") : await upsert(guild, "words", list));
    }

    await interaction.editReply(lines.length
      ? `${lines.join("\n")}\n\nDiscord enforces these even when I'm offline. Mods with Manage Server are never blocked.`
      : "Pick at least one option, like `filter: True` or `invites: True`.");
  },
};
