import type { Guild } from "discord.js";

const cache = new Map<string, { url: string; png: Buffer }>();

/** The server's icon as PNG bytes, or undefined if it has none (or it can't be downloaded). */
export async function serverIcon(guild: Guild): Promise<Buffer | undefined> {
  const url = guild.iconURL({ extension: "png", size: 512, forceStatic: true });
  if (!url) return undefined;
  const hit = cache.get(guild.id);
  if (hit?.url === url) return hit.png;
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const png = Buffer.from(await res.arrayBuffer());
    cache.set(guild.id, { url, png });
    return png;
  } catch {
    return undefined;
  }
}

export const emblemChoices = [
  { name: "Server icon (default)", value: "server" },
  { name: "Fenris wolf", value: "fenris" },
  { name: "None", value: "none" },
] as const;

/** Resolves an emblem choice into banner options. "server" falls back to the Fenris wolf if there's no icon. */
export async function emblemFor(guild: Guild, choice: string | null | undefined) {
  if (choice === "none") return { logo: false };
  if (choice === "fenris") return { logo: true };
  return { logo: true, emblemImage: await serverIcon(guild) };
}
