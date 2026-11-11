import type { Attachment } from "discord.js";

const MAX_BYTES = 8 * 1024 * 1024;

export function isImage(att: Attachment): boolean {
  return (att.contentType ?? "").startsWith("image/");
}

/**
 * Downloads an attachment so we can re-upload it. Attachment links from slash commands
 * expire after a while, so embedding the original URL would break the image later.
 */
export async function download(att: Attachment): Promise<Buffer> {
  if (att.size > MAX_BYTES) throw new UserError("That image is over 8 MB. Please use a smaller one.");
  const res = await fetch(att.url);
  if (!res.ok) throw new Error(`Downloading attachment failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** An error whose message is safe and helpful to show to the person who ran the command. */
export class UserError extends Error {}
