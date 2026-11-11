import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "fenris-"));
const { awardMessageXp, getXp, levelFromXp, progressBar, xpForNext } = await import("../src/lib/levels.js");
const { draw } = await import("../src/commands/giveaway.js");

test("level curve", () => {
  assert.equal(xpForNext(0), 100);
  assert.deepEqual(levelFromXp(0), { level: 0, into: 0, needed: 100 });
  assert.deepEqual(levelFromXp(100), { level: 1, into: 0, needed: 155 });
  assert.equal(levelFromXp(100 + 155 + 220).level, 3);
});

test("XP has a one-minute cooldown", () => {
  const t = 1_000_000;
  assert.equal(awardMessageXp("g", "u", t).gained, true);
  assert.equal(awardMessageXp("g", "u", t + 30_000).gained, false);
  assert.equal(awardMessageXp("g", "u", t + 61_000).gained, true);
  const e = getXp("g", "u");
  assert.equal(e.messages, 3);
  assert.ok(e.xp >= 30 && e.xp <= 50);
});

test("progress bar", () => {
  assert.equal(progressBar(50, 100, 4), "▰▰▱▱");
});

test("draw picks distinct winners", () => {
  const w = draw(["a", "b", "c"], 2);
  assert.equal(w.length, 2);
  assert.equal(new Set(w).size, 2);
  assert.deepEqual(draw([], 3), []);
  assert.equal(draw(["a"], 5).length, 1);
});
