import assert from "node:assert/strict";
import { test } from "node:test";
import { bannerStyles, bannerSvg, renderBanner, wrapText } from "../src/lib/banner.js";

test("wrapText fits lines and rejects overflow", () => {
  assert.deepEqual(wrapText("Game Night This Friday", 100, 700, 2), ["Game Night", "This Friday"]);
  assert.equal(wrapText("A very long title that will never fit in two short lines", 100, 400, 2), null);
});

test("every style renders a PNG", () => {
  for (const style of Object.keys(bannerStyles)) {
    const png = renderBanner({ title: "Test <Title> & more", subtitle: "Sub", style, width: 800, height: 320 });
    assert.equal(png.subarray(1, 4).toString(), "PNG", style);
  }
});

test("text is escaped and the same title gives the same art", () => {
  const svg = bannerSvg({ title: "A < B & C" });
  assert.ok(svg.includes("A &lt; B &amp; C"));
  assert.equal(bannerSvg({ title: "Same" }), bannerSvg({ title: "Same" }));
});
