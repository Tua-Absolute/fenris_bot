// Bot catcher: a bait post that real people are told to ignore. Spam accounts that react to it, or post in the
// trap channel, are banned (or kicked / timed out) automatically.
import { Events, PermissionFlagsBits, type Client, type Guild, type GuildMember, type PartialUser, type User } from "discord.js";
import { brandEmbed, colors } from "../lib/brand.js";
import { modLog } from "../lib/modlog.js";
import { getSettings } from "../lib/settings.js";

const handling = new Set<string>(); // avoid double-acting when someone reacts several times at once

function exempt(member: GuildMember | null, user: User): boolean {
  if (user.bot && !user.system) return true; // real bot accounts (like Fenris) are verified apps, not spam
  if (!member) return false;
  return member.id === member.guild.ownerId || member.permissions.has(PermissionFlagsBits.ManageMessages);
}

export async function springTrap(guild: Guild, partialUser: User | PartialUser, how: string) {
  const trap = getSettings(guild.id).botTrap;
  const user = partialUser.partial ? await partialUser.fetch().catch(() => null) : partialUser;
  if (!user) return;
  if (!trap || handling.has(`${guild.id}:${user.id}`)) return;
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (exempt(member, user)) return;
  handling.add(`${guild.id}:${user.id}`);
  try {
    const reason = `Fenris bot catcher: ${how}`;
    if (trap.action === "ban") await guild.members.ban(user, { reason, deleteMessageSeconds: 24 * 3600 });
    else if (trap.action === "kick") await member?.kick(reason);
    else await member?.timeout(7 * 86_400_000, reason);
    const did = { ban: "🔨 Banned", kick: "👢 Kicked", timeout: "🔇 Timed out (7 days)" }[trap.action];
    await modLog(guild, brandEmbed(colors.red).setTitle("🪤 Bot catcher").setDescription(
      `${did} <@${user.id}> (${user.tag})\n**Why:** ${how}\n**Account created:** <t:${Math.floor(user.createdTimestamp / 1000)}:R>` +
      (trap.action === "ban" ? "\nTheir messages from the last 24 hours were deleted." : "")));
    console.log(`Bot catcher: ${trap.action} ${user.tag} in ${guild.name} (${how})`);
  } catch (e) {
    console.error(`Bot catcher couldn't ${trap.action} ${user.tag}:`, (e as Error).message);
    await modLog(guild, brandEmbed(colors.gold).setTitle("🪤 Bot catcher").setDescription(
      `<@${user.id}> fell for the trap (${how}), but I couldn't ${trap.action} them. Check my role is above theirs and I have the permission.`));
  } finally {
    setTimeout(() => handling.delete(`${guild.id}:${user.id}`), 60_000);
  }
}

export function registerBotTrap(client: Client) {
  client.on(Events.MessageReactionAdd, (reaction, user) => {
    const guild = reaction.message.guild;
    const trap = guild && getSettings(guild.id).botTrap;
    if (!guild || !trap || reaction.message.id !== trap.messageId || user.id === client.user?.id) return;
    void springTrap(guild, user, "reacted to the bot-catcher post");
  });

  client.on(Events.MessageCreate, (message) => {
    if (!message.inGuild()) return;
    const trap = getSettings(message.guild.id).botTrap;
    if (!trap || message.channelId !== trap.channelId || message.author.id === client.user?.id) return;
    void springTrap(message.guild, message.author, "posted in the bot-catcher channel");
  });
}
