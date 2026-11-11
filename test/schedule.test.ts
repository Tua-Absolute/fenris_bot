import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const dir = mkdtempSync(join(tmpdir(), "fenris-"));
process.env.DATA_DIR = dir;
const { addScheduled, listScheduled, removeScheduled, saveImage } = await import("../src/lib/schedule.js");

const base = { channelId: "c1", title: "Hello", body: "World", color: 0xc8102e };

test("schedules are saved to disk in time order and can be removed", async () => {
  const later = await addScheduled("g1", "u1", new Date(Date.now() + 7200_000), { ...base, title: "Later" });
  const sooner = await addScheduled("g1", "u1", new Date(Date.now() + 3600_000), { ...base, title: "Sooner" });
  await addScheduled("g2", "u1", new Date(Date.now() + 3600_000), base);

  assert.deepEqual(listScheduled("g1").map((i) => i.data.title), ["Sooner", "Later"]);
  const onDisk = JSON.parse(readFileSync(join(dir, "schedule.json"), "utf8"));
  assert.equal(onDisk.length, 3);

  await removeScheduled(sooner.id);
  assert.deepEqual(listScheduled("g1").map((i) => i.id), [later.id]);
});

test("removing a schedule deletes its saved image", async () => {
  const path = await saveImage(Buffer.from("png"), "png");
  const item = await addScheduled("g3", "u1", new Date(Date.now() + 60_000), { ...base, imageFile: path });
  assert.ok(existsSync(path));
  await removeScheduled(item.id);
  assert.ok(!existsSync(path));
});
