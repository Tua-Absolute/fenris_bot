// XP for chatting (once a minute per member), level-up messages, and level role rewards.
import { Events, type Client, type GuildMember, type GuildTextBasedChannel, type Message } from "discord.js";
import { brandEmbed, colors } from "../lib/brand.js";
import { awardMessageXp } from "../lib/levels.js";
import { getSettings } from "../lib/settings.js";
import { countMessage } from "../lib/activity.js";

/** Gives every reward role at or below the member's level. */
export async function applyLevelRoles(member: GuildMember, level: number): Promise<string[]> {
  const rewards = getSettings(member.guild.id).levelRoles ?? {};
  const given: string[] = [];
  for (const [lvl, roleId] of Object.entries(rewards)) {
    if (Number(lvl) <= level && !member.roles.cache.has(roleId)) {
      const ok = await member.roles.add(roleId, `Reached level ${lvl}`).then(() => true, (e) => {
        console.error(`Level role ${roleId} failed (is my role above it?):`, e.message);
        return false;
      });
      if (ok) given.push(roleId);
    }
  }
  return given;
}

async function onMessage(message: Message) {
  if (message.author.bot || !message.inGuild()) return;
  countMessage(message.guild.id, message.channel.id);
  const s = getSettings(message.guild.id);
  if (!s.levelsEnabled) return;
  const { levelUp } = awardMessageXp(message.guild.id, message.author.id);
  if (levelUp === null || !message.member) return;

  const roles = await applyLevelRoles(message.member, levelUp);
  const target = (s.levelUpChannelId ? message.guild.channels.cache.get(s.levelUpChannelId) : message.channel) as GuildTextBasedChannel | undefined;
  await target?.send({
    embeds: [brandEmbed(colors.red).setThumbnail(message.author.displayAvatarURL())
      .setDescription(`🐺 **Level up!** <@${message.author.id}> reached **level ${levelUp}**!` +
        (roles.length ? `\nUnlocked ${roles.map((r) => `<@&${r}>`).join(" ")}` : ""))],
    allowedMentions: { parse: [] },
  }).catch(() => {});
}

export function registerLevels(client: Client) {
  client.on(Events.MessageCreate, (m) => void onMessage(m));
}
