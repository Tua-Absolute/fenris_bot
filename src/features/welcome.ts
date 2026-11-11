import { AttachmentBuilder, Events, type Client, type GuildMember, type GuildTextBasedChannel } from "discord.js";
import { renderBanner } from "../lib/banner.js";
import { DEFAULT_WELCOME, fillTemplate, getSettings } from "../lib/settings.js";

async function avatarPng(member: GuildMember): Promise<Buffer | undefined> {
  try {
    const res = await fetch(member.displayAvatarURL({ extension: "png", size: 512, forceStatic: true }));
    return res.ok ? Buffer.from(await res.arrayBuffer()) : undefined;
  } catch {
    return undefined;
  }
}

export async function welcomeCard(member: GuildMember, style?: string): Promise<Buffer> {
  return renderBanner({
    title: `Welcome, ${member.displayName}!`,
    subtitle: `Member #${member.guild.memberCount} · ${member.guild.name}`,
    style: style ?? "fenris",
    emblemImage: await avatarPng(member),
  });
}

async function onJoin(member: GuildMember) {
  const s = getSettings(member.guild.id);

  if (s.autoRoleId) {
    await member.roles.add(s.autoRoleId, "Fenris auto-role").catch((e) =>
      console.error(`Auto-role failed in ${member.guild.name} (is my role above it?):`, e.message));
  }

  if (!s.welcomeChannelId || member.user.bot) return;
  const channel = await member.guild.channels.fetch(s.welcomeChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  const text = fillTemplate(s.welcomeMessage ?? DEFAULT_WELCOME, {
    user: `<@${member.id}>`, name: member.displayName, server: member.guild.name, count: member.guild.memberCount,
  });
  await (channel as GuildTextBasedChannel).send({
    content: text,
    files: [new AttachmentBuilder(await welcomeCard(member, s.welcomeStyle), { name: "welcome.png" })],
    allowedMentions: { users: [member.id] },
  }).catch((e) => console.error("Welcome message failed:", e.message));
}

export function registerWelcome(client: Client) {
  client.on(Events.GuildMemberAdd, (member) => void onJoin(member));
}
