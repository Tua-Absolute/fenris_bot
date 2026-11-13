import { AttachmentBuilder, ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type EmbedBuilder, type GuildTextBasedChannel } from "discord.js";
import { claudeAllowedIn } from "../config.js";
import { renderBanner } from "../lib/banner.js";
import { brandEmbed, colors } from "../lib/brand.js";
import { UserError } from "../lib/files.js";
import type { Command } from "./types.js";

const LINE = "━━━━━━━━━━━━━━━━━━━━";
const section = (title: string, body: string[], color: number = colors.red): EmbedBuilder =>
  brandEmbed(color).setTitle(title).setDescription(body.join("\n")).setTimestamp(null);

function memberGuide(withClaude: boolean): EmbedBuilder[] {
  const list = [
    section("🐺 Meet Fenris", [
      "*The guardian of this server. Fenris hands out roles, celebrates birthdays, runs giveaways, and keeps the pack safe.*",
      LINE,
      "Type **/** in any channel to see everything you can use. Most replies are only visible to you.",
    ]),
    section("🎭 Pick Your Roles", [
      "▸ Find a **role panel** and click a button to get that role.",
      "▸ Click it again to remove it.",
      "▸ Some panels only let you pick **one**, so choosing another swaps it.",
      "-# Can't click a panel? It may be for members with a certain role only.",
    ], colors.ember),
    section("🎂 Birthdays", [
      "Let the pack celebrate you! Either way works:",
      "> `@Fenris my birthday is March 3`",
      "> `/birthday set`",
      "▸ `/birthday upcoming` shows who's next.",
      "▸ `@Fenris forget my birthday` removes yours.",
      "-# Only the month and day are saved, never your age.",
    ]),
    section("📈 Levels & Fun", [
      "▸ **Chat to earn XP** and level up. `/rank` shows your level, `/leaderboard show` shows the top 10.",
      "▸ **Giveaways:** click **Enter** on a giveaway post.",
      "▸ **Events:** click **Interested** on an event and Fenris reminds you before it starts.",
      "▸ `/poll` starts a vote, `/fancy` makes 𝓯𝓪𝓷𝓬𝔂 text, and `/banner` draws a banner image.",
    ], colors.ember),
    section("🎫 Need Help?", [
      "Click **Open a ticket** on the support panel, or use `/ticket open`.",
      "You'll get a private channel with the staff team.",
    ]),
  ];
  if (withClaude) list.push(section("💬 Talk to Fenris", [
    "Mention **@Fenris** (or reply to it) to ask a question or chat.",
    "> `@Fenris catch me up`: a summary of what you missed",
    "▸ `/catchup` does the same, privately.",
    "-# There's a daily limit, so Fenris may rest until tomorrow.",
  ], colors.ember));
  return list;
}

function adminGuide(withClaude: boolean): EmbedBuilder[] {
  const list = [
    section("⚙️ Setting Up", [
      "▸ `/settings view` shows everything at a glance.",
      "▸ `/settings welcome` sets welcome cards and an auto-role for new members.",
      "▸ `/settings modlog` picks a channel that logs edits, deletes, joins, and bans.",
      "▸ **Important:** drag the **Fenris** role above any role it should hand out (Server Settings > Roles).",
    ]),
    section("📣 Announcements & Events", [
      "▸ `/announce` posts a styled announcement, now or later (`when`), and can repeat it.",
      "▸ `/schedule list` shows what's waiting, and `/schedule cancel` cancels it.",
      "▸ `/event create` adds an event to the calendar. `/settings reminders` turns on reminders.",
      "▸ `/quotes setup` posts an inspirational quote daily, weekly, or monthly at the hour you pick.",
    ], colors.ember),
    section("🛡️ Moderation", [
      "▸ `/warn`, `/timeout`, and `/purge` keep things in line, and all of them are logged.",
      "▸ `/automod setup` turns on Discord's filters for bad words, invite links, and spam.",
      "▸ `/bottrap setup` posts a bait message. Bots that react to it or post in its channel get removed.",
    ]),
    section("📜 Rules & Roles", [
      "▸ `/rules post` posts the rules with an **I agree** button that swaps the intro role for the member role.",
      "▸ `/roles` builds a role panel with colors, emojis, and descriptions.",
      "▸ To edit a panel later, right-click it > **Apps** > **Edit role panel**.",
    ], colors.ember),
    section("🎁 Community", [
      "▸ `/giveaway start` runs a giveaway, and winners are drawn automatically.",
      "▸ `/settings levels` and `/settings level_role` turn on XP and reward roles.",
      "▸ `/birthday setup` picks the birthday channel, role, and message.",
      "▸ `/ticket panel` posts the support button, and `/stats counter` adds a live member count.",
    ]),
  ];
  if (withClaude) list.push(section("🧠 Claude (This Server Only)", [
    "▸ Ask **@Fenris** to draft an announcement or event, then press **Confirm**.",
    "▸ `/settings faq` teaches Fenris your server's rules, links, and schedules.",
    "▸ `/settings recap` posts a weekly recap on Sundays, or use `/recap` any time.",
  ], colors.ember));
  return list;
}

export const guide: Command = {
  data: new SlashCommandBuilder()
    .setName("guide")
    .setDescription("A styled guide to everything Fenris can do.")
    .addStringOption((o) => o.setName("for").setDescription("Which guide (default: members)").addChoices(
      { name: "Members", value: "members" },
      { name: "Admins and mods", value: "admins" },
      { name: "Everything", value: "all" }))
    .addChannelOption((o) => o.setName("post_in").setDescription("Post it publicly in a channel (needs Manage Server). Leave empty to see it privately.")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),

  async execute(interaction) {
    const guild = interaction.guild!;
    const which = interaction.options.getString("for") ?? "members";
    const target = interaction.options.getChannel("post_in") as GuildTextBasedChannel | null;
    const withClaude = claudeAllowedIn(guild.id);

    const embeds = [
      ...(which !== "admins" ? memberGuide(withClaude) : []),
      ...(which !== "members" ? adminGuide(withClaude) : []),
    ];
    const subtitle = which === "admins" ? "For admins and mods" : which === "all" ? "Everything Fenris can do" : `Your guide to ${guild.name}`;
    const banner = new AttachmentBuilder(renderBanner({ title: "Fenris Field Guide", subtitle, style: "ember" }), { name: "guide.png" });

    // Discord allows 10 embeds per message, so long guides are split.
    const batches: EmbedBuilder[][] = [];
    for (let i = 0; i < embeds.length; i += 6) batches.push(embeds.slice(i, i + 6));

    if (!target) {
      await interaction.reply({ files: [banner], embeds: batches[0], flags: MessageFlags.Ephemeral });
      for (const b of batches.slice(1)) await interaction.followUp({ embeds: b, flags: MessageFlags.Ephemeral });
      return;
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) throw new UserError("Posting the guide publicly needs the **Manage Server** permission. Leave `post_in` empty to see it yourself.");
    const me = await guild.members.fetchMe();
    if (!target.permissionsFor(me)?.has(["ViewChannel", "SendMessages", "EmbedLinks", "AttachFiles"])) {
      throw new UserError(`I can't post in <#${target.id}>. Give my role **Send Messages**, **Embed Links**, and **Attach Files** there.`);
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await target.send({ files: [banner], embeds: batches[0] });
    for (const b of batches.slice(1)) await target.send({ embeds: b });
    await interaction.editReply(`Posted the guide in <#${target.id}>!`);
  },
};
