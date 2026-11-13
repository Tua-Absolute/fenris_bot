// Every morning at 9 AM (server time), wish members a happy birthday and give the birthday role for the day.
import { AttachmentBuilder, type Client, type Guild, type GuildMember, type GuildTextBasedChannel } from "discord.js";
import { config } from "../config.js";
import { renderBanner } from "../lib/banner.js";
import { allBirthdays, isBirthdayOn, markAnnounced, wasAnnounced } from "../lib/birthdays.js";
import { fillTemplate, getSettings } from "../lib/settings.js";
import { partsInZone } from "../lib/time.js";

export const DEFAULT_BIRTHDAY = "🎂 Happy birthday, {user}! The whole pack is howling for you today. 🐺🎉";
const ANNOUNCE_HOUR = 9;
const cleanedOn = new Map<string, string>(); // guildId -> date the role was last cleaned up

async function avatarPng(member: GuildMember): Promise<Buffer | undefined> {
  try {
    const res = await fetch(member.displayAvatarURL({ extension: "png", size: 512, forceStatic: true }));
    return res.ok ? Buffer.from(await res.arrayBuffer()) : undefined;
  } catch {
    return undefined;
  }
}

export async function birthdayCard(member: GuildMember): Promise<Buffer> {
  return renderBanner({ title: `Happy Birthday, ${member.displayName}!`, subtitle: `Today · ${member.guild.name}`, style: "ember", emblemImage: await avatarPng(member) });
}

export async function announceBirthday(guild: Guild, member: GuildMember, channel: GuildTextBasedChannel) {
  const s = getSettings(guild.id);
  const text = fillTemplate(s.birthdayMessage ?? DEFAULT_BIRTHDAY, {
    user: `<@${member.id}>`, name: member.displayName, server: guild.name, count: guild.memberCount,
  });
  await channel.send({
    content: text,
    files: [new AttachmentBuilder(await birthdayCard(member), { name: "birthday.png" })],
    allowedMentions: { users: [member.id] },
  });
}

async function check(client: Client<true>) {
  const p = partsInZone(new Date(), config.timezone());
  const today = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  for (const guild of client.guilds.cache.values()) {
    const s = getSettings(guild.id);
    // Once a day, take the birthday role back from anyone whose birthday isn't today.
    if (s.birthdayRoleId && cleanedOn.get(guild.id) !== today) {
      cleanedOn.set(guild.id, today);
      await guild.members.fetch().catch(() => null);
      const role = guild.roles.cache.get(s.birthdayRoleId);
      for (const m of role?.members.values() ?? []) {
        const b = allBirthdays(guild.id).find(([id]) => id === m.id)?.[1];
        if (!b || !isBirthdayOn(b, p.year, p.month, p.day)) await m.roles.remove(role!, "Birthday is over").catch(() => {});
      }
    }
    if (!s.birthdayChannelId || p.hour < ANNOUNCE_HOUR) continue;
    const channel = guild.channels.cache.get(s.birthdayChannelId);
    if (!channel?.isTextBased()) continue;
    for (const [userId, b] of allBirthdays(guild.id)) {
      if (!isBirthdayOn(b, p.year, p.month, p.day) || wasAnnounced(guild.id, userId, today)) continue;
      await markAnnounced(guild.id, userId, today);
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) continue; // left the server
      if (s.birthdayRoleId) await member.roles.add(s.birthdayRoleId, "Happy birthday!").catch((e) => console.error("Birthday role failed:", e.message));
      await announceBirthday(guild, member, channel as GuildTextBasedChannel)
        .catch((e) => console.error(`Birthday post for ${member.user.tag} failed:`, e));
    }
  }
}

export function startBirthdays(client: Client<true>) {
  void check(client);
  setInterval(() => void check(client), 10 * 60_000);
}
