import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "fenris-"));
const { daysUntil, isBirthdayOn, validDate } = await import("../src/lib/birthdays.js");

test("validDate", () => {
  assert.ok(validDate(2, 29));
  assert.ok(!validDate(2, 30));
  assert.ok(!validDate(4, 31));
  assert.ok(!validDate(13, 1));
});

test("Feb 29 birthdays move to Feb 28 in other years", () => {
  const leapling = { month: 2, day: 29 };
  assert.ok(isBirthdayOn(leapling, 2027, 2, 28));
  assert.ok(!isBirthdayOn(leapling, 2028, 2, 28));
  assert.ok(isBirthdayOn(leapling, 2028, 2, 29));
});

test("daysUntil wraps into next year", () => {
  assert.equal(daysUntil({ month: 11, day: 13 }, 2026, 11, 13), 0);
  assert.equal(daysUntil({ month: 11, day: 20 }, 2026, 11, 13), 7);
  assert.equal(daysUntil({ month: 1, day: 1 }, 2026, 12, 31), 1);
});
