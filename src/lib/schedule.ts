// Scheduled announcements, saved to a JSON file so they survive restarts and redeploys.
// On Railway, attach a Volume at /app/data (see README) or schedules reset on each deploy.
import type { Client, GuildTextBasedChannel } from "discord.js";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildAnnouncement, type AnnouncementData } from "./announcement.js";

export interface ScheduledAnnouncement {
  id: string;
  guildId: string;
  createdBy: string;
  postAt: number;
  data: AnnouncementData;
  attempts?: number;
}

import { dataDir } from "./store.js";
export { dataDir };
const file = join(dataDir, "schedule.json");
mkdirSync(join(dataDir, "images"), { recursive: true });

let items: ScheduledAnnouncement[] = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];

async function save() {
  const tmp = `${file}.tmp`;
  await writeFile(tmp, JSON.stringify(items, null, 2));
  await rename(tmp, file);
}

export async function saveImage(bytes: Buffer, ext: string): Promise<string> {
  const path = join(dataDir, "images", `${randomUUID()}.${ext.replace(/[^a-z0-9]/gi, "") || "png"}`);
  await writeFile(path, bytes);
  return path;
}

export async function addScheduled(guildId: string, createdBy: string, postAt: Date, data: AnnouncementData) {
  const item: ScheduledAnnouncement = { id: randomUUID().slice(0, 8), guildId, createdBy, postAt: postAt.getTime(), data };
  items.push(item);
  items.sort((a, b) => a.postAt - b.postAt);
  await save();
  return item;
}

export function listScheduled(guildId: string): ScheduledAnnouncement[] {
  return items.filter((i) => i.guildId === guildId);
}

export async function removeScheduled(id: string): Promise<ScheduledAnnouncement | undefined> {
  const item = items.find((i) => i.id === id);
  if (!item) return undefined;
  items = items.filter((i) => i.id !== id);
  await save();
  if (item.data.imageFile) await unlink(item.data.imageFile).catch(() => {});
  return item;
}

const MAX_ATTEMPTS = 3;

async function postDue(client: Client<true>) {
  const now = Date.now();
  for (const item of items.filter((i) => i.postAt <= now)) {
    try {
      const guild = client.guilds.cache.get(item.guildId);
      const channel = await guild?.channels.fetch(item.data.channelId);
      if (!guild || !channel?.isTextBased()) throw new Error("server or channel no longer available");
      const { message } = await buildAnnouncement(guild, item.data);
      await (channel as GuildTextBasedChannel).send(message);
      console.log(`Posted scheduled announcement ${item.id} ("${item.data.title}")`);
      await removeScheduled(item.id);
    } catch (error) {
      item.attempts = (item.attempts ?? 0) + 1;
      console.error(`Scheduled announcement ${item.id} failed (attempt ${item.attempts}):`, error);
      if (item.attempts >= MAX_ATTEMPTS) await removeScheduled(item.id);
      else await save();
    }
  }
}

/** Checks every 30 seconds for announcements that are due. Late ones (bot was offline) post right away. */
export function startScheduler(client: Client<true>) {
  if (items.length) console.log(`${items.length} scheduled announcement(s) loaded.`);
  void postDue(client);
  setInterval(() => void postDue(client), 30_000);
}
