// Giveaways: members click a button to enter, and Fenris draws winners when time runs out.
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ButtonInteraction,
  type Client,
  type GuildTextBasedChannel,
} from "discord.js";
import { randomBytes, randomInt } from "node:crypto";
import { brandEmbed, colors, discordTime } from "../lib/brand.js";
import { UserError } from "../lib/files.js";
import { formatDuration, parseDuration } from "../lib/modlog.js";
import { JsonStore } from "../lib/store.js";
import type { Command } from "./types.js";

interface Giveaway {
  id: string; guildId: string; channelId: string; messageId: string; hostId: string;
  prize: string; winners: number; endsAt: number; entrants: string[]; ended?: boolean; winnerIds?: string[]; requiredRoleId?: string;
}
const store = new JsonStore<Record<string, Giveaway>>("giveaways", {});

/** Picks up to `n` different entrants at random. */
export function draw(entrants: string[], n: number): string[] {
  const pool = [...entrants];
  const out: string[] = [];
  while (pool.length && out.length < n) out.push(pool.splice(randomInt(pool.length), 1)[0]);
  return out;
}

function embedFor(g: Giveaway) {
  const e = brandEmbed(g.ended ? colors.white : colors.gold).setTitle(`🎉 ${g.prize}`);
  if (g.ended) {
    return e.setDescription(`**Ended** ${discordTime(new Date(g.endsAt), "R")}\n**Winner${g.winners === 1 ? "" : "s"}:** ` +
      (g.winnerIds?.length ? g.winnerIds.map((w) => `<@${w}>`).join(", ") : "nobody entered 😢") +
      `\n**Entries:** ${g.entrants.length}\nHosted by <@${g.hostId}>`);
  }
  return e.setDescription(`Click **Enter** to join!\n\n**Ends:** ${discordTime(new Date(g.endsAt), "R")} (${discordTime(new Date(g.endsAt), "f")})\n` +
    `**Winners:** ${g.winners}\n**Entries:** ${g.entrants.length}` + (g.requiredRoleId ? `\n**Must have:** <@&${g.requiredRoleId}>` : "") +
    `\nHosted by <@${g.hostId}>`).setFooter({ text: `Giveaway ${g.id}` });
}

const row = (g: Giveaway) => new ActionRowBuilder<ButtonBuilder>().addComponents(
  new ButtonBuilder().setCustomId(`giveaway:enter:${g.id}`).setLabel(`Enter (${g.entrants.length})`).setEmoji("🎉")
    .setStyle(ButtonStyle.Success).setDisabled(!!g.ended));

async function finish(client: Client, g: Giveaway, reroll = false) {
  g.ended = true;
  g.winnerIds = draw(g.entrants, g.winners);
  await store.save();
  const channel = await client.channels.fetch(g.channelId).catch(() => null) as GuildTextBasedChannel | null;
  if (!channel) return;
  const msg = await channel.messages.fetch(g.messageId).catch(() => null);
  await msg?.edit({ embeds: [embedFor(g)], components: [row(g)] }).catch(() => {});
  await channel.send({
    content: g.winnerIds.length
      ? `🎉 ${reroll ? "New winner" : "Congratulations"} ${g.winnerIds.map((w) => `<@${w}>`).join(", ")}! You won **${g.prize}**!`
      : `Nobody entered the **${g.prize}** giveaway. 😢`,
    allowedMentions: { users: g.winnerIds },
    ...(msg ? { reply: { messageReference: msg.id, failIfNotExists: false } } : {}),
  }).catch(() => {});
}

export function startGiveaways(client: Client<true>) {
  const tick = async () => {
    for (const g of Object.values(store.data)) {
      if (!g.ended && g.endsAt <= Date.now()) await finish(client, g).catch((e) => console.error("Giveaway end failed:", e));
    }
    // forget giveaways that ended over 30 days ago
    for (const [id, g] of Object.entries(store.data)) if (g.ended && g.endsAt < Date.now() - 30 * 86_400_000) delete store.data[id];
  };
  void tick();
  setInterval(() => void tick(), 15_000);
}

function find(guildId: string, idOrMessage: string): Giveaway {
  const g = Object.values(store.data).find((x) => x.guildId === guildId && (x.id === idOrMessage || x.messageId === idOrMessage));
  if (!g) throw new UserError("I couldn't find that giveaway. Pick it from the suggestions.");
  return g;
}

export const giveaway: Command = {
  data: new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Run giveaways.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName("start").setDescription("Start a giveaway in this channel.")
      .addStringOption((o) => o.setName("prize").setDescription("What they win").setRequired(true).setMaxLength(200))
      .addStringOption((o) => o.setName("duration").setDescription("How long, e.g. 1h, 2d, 1w").setRequired(true))
      .addIntegerOption((o) => o.setName("winners").setDescription("How many winners (default 1)").setMinValue(1).setMaxValue(20))
      .addRoleOption((o) => o.setName("required_role").setDescription("Only members with this role can enter")))
    .addSubcommand((s) => s.setName("end").setDescription("End a giveaway now and draw winners.")
      .addStringOption((o) => o.setName("giveaway").setDescription("Which one").setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) => s.setName("reroll").setDescription("Draw new winners for an ended giveaway.")
      .addStringOption((o) => o.setName("giveaway").setDescription("Which one").setRequired(true).setAutocomplete(true))),

  async execute(interaction) {
    const guild = interaction.guild!;
    const sub = interaction.options.getSubcommand();
    if (sub === "start") {
      const ms = parseDuration(interaction.options.getString("duration", true));
      if (!ms || ms < 60_000) throw new UserError("I couldn't read that duration. Try `30m`, `1h`, `2d`, or `1w`.");
      if (ms > 30 * 86_400_000) throw new UserError("Giveaways can run for up to 30 days.");
      const g: Giveaway = {
        id: randomBytes(3).toString("hex"), guildId: guild.id, channelId: interaction.channelId, messageId: "", hostId: interaction.user.id,
        prize: interaction.options.getString("prize", true), winners: interaction.options.getInteger("winners") ?? 1,
        endsAt: Date.now() + ms, entrants: [], requiredRoleId: interaction.options.getRole("required_role")?.id,
      };
      const msg = await (interaction.channel as GuildTextBasedChannel).send({ embeds: [embedFor(g)], components: [row(g)], allowedMentions: { parse: [] } });
      g.messageId = msg.id;
      store.data[g.id] = g;
      await store.save();
      await interaction.reply({ content: `Giveaway started! It ends in ${formatDuration(ms)}. ID \`${g.id}\`.`, flags: MessageFlags.Ephemeral });
      return;
    }
    const g = find(guild.id, interaction.options.getString("giveaway", true));
    if (sub === "end") {
      if (g.ended) throw new UserError("That giveaway already ended. Use `/giveaway reroll` for new winners.");
      g.endsAt = Date.now();
      await interaction.reply({ content: "Ending it now…", flags: MessageFlags.Ephemeral });
      await finish(interaction.client, g);
      return;
    }
    if (!g.ended) throw new UserError("That giveaway is still running.");
    await interaction.reply({ content: "Rerolling…", flags: MessageFlags.Ephemeral });
    await finish(interaction.client, g, true);
  },

  async autocomplete(interaction) {
    const sub = interaction.options.getSubcommand();
    const typed = interaction.options.getFocused().toLowerCase();
    await interaction.respond(Object.values(store.data)
      .filter((g) => g.guildId === interaction.guildId && (sub === "end" ? !g.ended : g.ended) && g.prize.toLowerCase().includes(typed))
      .slice(0, 25).map((g) => ({ name: `${g.prize} (${g.entrants.length} entries)`.slice(0, 100), value: g.id })));
  },

  async handleButton(interaction: ButtonInteraction) {
    const g = store.data[interaction.customId.split(":")[2]];
    if (!g || g.ended) throw new UserError("This giveaway has ended.");
    if (g.requiredRoleId) {
      const member = await interaction.guild!.members.fetch(interaction.user.id);
      if (!member.roles.cache.has(g.requiredRoleId)) throw new UserError(`You need the <@&${g.requiredRoleId}> role to enter.`);
    }
    const i = g.entrants.indexOf(interaction.user.id);
    if (i >= 0) g.entrants.splice(i, 1); else g.entrants.push(interaction.user.id);
    await store.save();
    await interaction.update({ embeds: [embedFor(g)], components: [row(g)] });
    await interaction.followUp({ content: i >= 0 ? "You left the giveaway." : "You're in! 🎉 Good luck. (Click again to leave.)", flags: MessageFlags.Ephemeral });
  },
};
