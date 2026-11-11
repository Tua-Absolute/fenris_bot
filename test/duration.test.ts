import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDuration, parseDuration } from "../src/lib/modlog.js";

test("parseDuration reads common forms", () => {
  assert.equal(parseDuration("10"), 600_000);
  assert.equal(parseDuration("10m"), 600_000);
  assert.equal(parseDuration("2h"), 7_200_000);
  assert.equal(parseDuration("1h30m"), 5_400_000);
  assert.equal(parseDuration("1d 2h"), 93_600_000);
  assert.equal(parseDuration("1w"), 604_800_000);
});

test("parseDuration rejects junk", () => {
  assert.equal(parseDuration("soon"), null);
  assert.equal(parseDuration("10x"), null);
  assert.equal(parseDuration("0m"), null);
  assert.equal(parseDuration("5m later"), null);
});

test("formatDuration", () => {
  assert.equal(formatDuration(5_400_000), "1h 30m");
  assert.equal(formatDuration(93_600_000), "1d 2h");
});
