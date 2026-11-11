import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDateTime } from "../src/lib/time.js";

const tz = "America/Chicago";
// Wednesday 2026-11-11 9:30 AM Central (15:30 UTC)
const now = new Date("2026-11-11T15:30:00Z");
const iso = (s: string) => parseDateTime(s, tz, now)?.toISOString() ?? null;

test("absolute dates", () => {
  assert.equal(iso("2026-11-14 20:00"), "2026-11-15T02:00:00.000Z");
  assert.equal(iso("11/14 8pm"), "2026-11-15T02:00:00.000Z");
  assert.equal(iso("11/14/2026 8:30 PM"), "2026-11-15T02:30:00.000Z");
  assert.equal(iso("1/5 noon"), "2027-01-05T18:00:00.000Z"); // past this year -> next year
});

test("relative dates", () => {
  assert.equal(iso("today 7pm"), "2026-11-12T01:00:00.000Z");
  assert.equal(iso("tomorrow at 8pm"), "2026-11-13T02:00:00.000Z");
  assert.equal(iso("fri 7:30pm"), "2026-11-14T01:30:00.000Z");
  assert.equal(iso("Friday 7:30pm"), "2026-11-14T01:30:00.000Z");
  assert.equal(iso("wed 8pm"), "2026-11-19T02:00:00.000Z"); // same weekday -> next week
});

test("time only", () => {
  assert.equal(iso("8pm"), "2026-11-12T02:00:00.000Z");
  assert.equal(iso("9am"), "2026-11-12T15:00:00.000Z"); // already passed -> tomorrow
});

test("daylight saving is respected", () => {
  assert.equal(iso("2027-07-04 21:00"), "2027-07-05T02:00:00.000Z"); // CDT, UTC-5
});

test("rejects nonsense", () => {
  for (const bad of ["soon", "2/31 8pm", "13/1 8pm", "fri 25:00", "fri 13pm", "tomorrow"]) {
    assert.equal(iso(bad), null, bad);
  }
});

test("nextRepeat keeps the local time across daylight saving", async () => {
  const { nextRepeat, zonedToUtc } = await import("../src/lib/time.js");
  const tz = "America/Chicago";
  const at = zonedToUtc(2026, 10, 30, 18, 0, tz); // Fri Oct 30 6 PM CDT
  const next = nextRepeat(at, "weekly", tz, at);
  assert.equal(next.getTime(), zonedToUtc(2026, 11, 6, 18, 0, tz).getTime()); // 6 PM CST
  assert.equal(next.getTime() - at.getTime(), 7 * 86_400_000 + 3_600_000);
});

test("nextRepeat monthly clamps to short months and skips missed runs", async () => {
  const { nextRepeat, zonedToUtc } = await import("../src/lib/time.js");
  const tz = "America/Chicago";
  const jan31 = zonedToUtc(2027, 1, 31, 9, 0, tz);
  assert.equal(nextRepeat(jan31, "monthly", tz, jan31).getTime(), zonedToUtc(2027, 2, 28, 9, 0, tz).getTime());
  const daily = zonedToUtc(2026, 11, 1, 8, 0, tz);
  const later = zonedToUtc(2026, 11, 5, 12, 0, tz);
  assert.equal(nextRepeat(daily, "daily", tz, later).getTime(), zonedToUtc(2026, 11, 6, 8, 0, tz).getTime());
});

test("dueReminder picks the day and hour reminders", async () => {
  process.env.DATA_DIR ??= (await import("node:fs")).mkdtempSync((await import("node:path")).join((await import("node:os")).tmpdir(), "fenris-"));
  const { dueReminder } = await import("../src/features/eventReminders.js");
  const H = 3_600_000;
  assert.equal(dueReminder(23 * H, []), "day");
  assert.equal(dueReminder(23 * H, ["day"]), null);
  assert.equal(dueReminder(10 * H, []), null);
  assert.equal(dueReminder(30 * 60_000, ["day"]), "hour");
  assert.equal(dueReminder(30 * 60_000, ["day", "hour"]), null);
  assert.equal(dueReminder(-60_000, []), null);
});
