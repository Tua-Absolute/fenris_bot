import assert from "node:assert/strict";
import { test } from "node:test";
import { fancy, fonts, resolveCustomEmoji, withDivider } from "../src/lib/fonts.js";

test("converts letters and digits", () => {
  assert.equal(fancy("Hi 5", "bold"), "𝐇𝐢 𝟓");
  assert.equal(fancy("hello", "italic"), "ℎ𝑒𝑙𝑙𝑜");
  assert.equal(fancy("Hero", "script"), "ℋℯ𝓇ℴ");
  assert.equal(fancy("CHZ", "double_struck"), "ℂℍℤ");
  assert.equal(fancy("Fenris", "small_caps"), "ꜰᴇɴʀɪꜱ");
  assert.equal(fancy("ab 1", "wide"), "ａｂ　１");
  assert.equal(fancy("hi!", "upside_down"), "¡ᴉɥ");
});

test("every font changes plain letters", () => {
  for (const name of Object.keys(fonts)) assert.notEqual(fancy("Wolf", name), "Wolf", name);
});

test("leaves Discord syntax and links alone", () => {
  const input = "Hey <@123> see <#456> :wolf: <t:1700000000:F> https://example.com/Page";
  const out = fancy(input, "bold");
  for (const keep of ["<@123>", "<#456>", ":wolf:", "<t:1700000000:F>", "https://example.com/Page"]) {
    assert.ok(out.includes(keep), keep);
  }
  assert.ok(out.startsWith("𝐇𝐞𝐲"));
});

test("unknown font returns text unchanged", () => {
  assert.equal(fancy("same", "nope"), "same");
  assert.equal(fancy("same", null), "same");
});

test("dividers wrap text", () => {
  assert.equal(withDivider("x", "none"), "x");
  assert.match(withDivider("x", "wolf"), /^🐺.*\nx\n🐺/);
});

test("custom emoji names become real server emoji", () => {
  const emojis = [{ name: "PogWolf", id: "111", animated: false }, { name: "dance", id: "222", animated: true }];
  assert.equal(resolveCustomEmoji("gg :pogwolf: :dance: :unknown:", emojis), "gg <:PogWolf:111> <a:dance:222> :unknown:");
  assert.equal(resolveCustomEmoji("<:PogWolf:111>", emojis), "<:PogWolf:111>");
});
