import { PermissionFlagsBits, type Guild, type GuildTextBasedChannel, type Message } from "discord.js";

/** Messages in a channel newer than `since`, oldest first, up to `max`. */
export async function messagesSince(channel: GuildTextBasedChannel, since: number, max = 300): Promise<Message[]> {
  const out: Message[] = [];
  let before: string | undefined;
  while (out.length < max) {
    const page = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
    if (!page?.size) break;
    for (const m of page.values()) {
      if (m.createdTimestamp < since) return out.reverse();
      out.push(m);
    }
    before = page.last()!.id;
    if (page.size < 100) break;
  }
  return out.slice(0, max).reverse();
}

/** "Name: text" lines Claude can read. Skips empty bot noise. */
export function transcript(messages: Message[], botId: string, perMessage = 300): string {
  return messages
    .filter((m) => m.cleanContent || m.embeds.length || m.attachments.size)
    .map((m) => {
      const who = m.author.id === botId ? "Fenris" : (m.member?.displayName ?? m.author.username);
      const text = m.cleanContent || m.embeds.map((e) => `[embed: ${e.title ?? ""}]`).join(" ") || "[attachment]";
      return `${who}: ${text.replace(/\s+/g, " ").slice(0, perMessage)}`;
    })
    .join("\n");
}

/** Text channels the bot can read. */
export function readableChannels(guild: Guild): GuildTextBasedChannel[] {
  const me = guild.members.me;
  return [...guild.channels.cache.values()].filter((c): c is GuildTextBasedChannel =>
    c.isTextBased() && !c.isThread() && !c.isVoiceBased() &&
    !!me && !!c.permissionsFor(me)?.has(PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ReadMessageHistory));
}
