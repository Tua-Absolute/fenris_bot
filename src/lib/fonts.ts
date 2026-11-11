// "Fancy fonts" for Discord. Discord can't change fonts, so these swap ordinary letters for
// look-alike Unicode characters (the same trick sites like discord-fonts.com use).
// They work anywhere: messages, embeds, nicknames, channel names.

type Mapper = (ch: string) => string;

/** Builds a mapper for the Unicode "Mathematical Alphanumeric Symbols" block. */
function math(upper: number, lower: number | null, digit: number | null, exceptions: Record<string, number> = {}): Mapper {
  return (ch) => {
    if (exceptions[ch] !== undefined) return String.fromCodePoint(exceptions[ch]);
    const c = ch.charCodeAt(0);
    if (c >= 65 && c <= 90) return String.fromCodePoint(upper + c - 65);
    if (c >= 97 && c <= 122) return lower === null ? ch : String.fromCodePoint(lower + c - 97);
    if (c >= 48 && c <= 57) return digit === null ? ch : String.fromCodePoint(digit + c - 48);
    return ch;
  };
}

function table(map: Record<string, string>, caseInsensitive = false): Mapper {
  return (ch) => map[caseInsensitive ? ch.toLowerCase() : ch] ?? ch;
}

const SMALL_CAPS = table(Object.fromEntries(
  "abcdefghijklmnopqrstuvwxyz".split("").map((c, i) => [c, "ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ"[i]]),
), true);

const UPSIDE: Record<string, string> = Object.fromEntries(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?'\"()[]{}<>&_"
    .split("")
    .map((c, i) => [c, [..."ɐqɔpǝɟƃɥᴉɾʞlɯuodbɹsʇnʌʍxʎz∀ꓭƆꓷƎℲ⅁HIſꓘ˥WNOԀꝹꓤSꓕՈΛMX⅄Z0ƖᄅƐㄣϛ9ㄥ86˙'¡¿,„)(][}{><⅋‾"][i]]),
);

export const fonts = {
  bold: { name: "𝐁𝐨𝐥𝐝", map: math(0x1d400, 0x1d41a, 0x1d7ce) },
  italic: { name: "𝐼𝑡𝑎𝑙𝑖𝑐", map: math(0x1d434, 0x1d44e, null, { h: 0x210e }) },
  bold_italic: { name: "𝑩𝒐𝒍𝒅 𝑰𝒕𝒂𝒍𝒊𝒄", map: math(0x1d468, 0x1d482, null) },
  script: {
    name: "𝒮𝒸𝓇𝒾𝓅𝓉",
    map: math(0x1d49c, 0x1d4b6, null, {
      B: 0x212c, E: 0x2130, F: 0x2131, H: 0x210b, I: 0x2110, L: 0x2112, M: 0x2133, R: 0x211b, e: 0x212f, g: 0x210a, o: 0x2134,
    }),
  },
  bold_script: { name: "𝓑𝓸𝓵𝓭 𝓢𝓬𝓻𝓲𝓹𝓽", map: math(0x1d4d0, 0x1d4ea, null) },
  gothic: { name: "𝔊𝔬𝔱𝔥𝔦𝔠", map: math(0x1d504, 0x1d51e, null, { C: 0x212d, H: 0x210c, I: 0x2111, R: 0x211c, Z: 0x2128 }) },
  bold_gothic: { name: "𝕭𝖔𝖑𝖉 𝕲𝖔𝖙𝖍𝖎𝖈", map: math(0x1d56c, 0x1d586, null) },
  double_struck: {
    name: "𝔻𝕠𝕦𝕓𝕝𝕖-𝕤𝕥𝕣𝕦𝕔𝕜",
    map: math(0x1d538, 0x1d552, 0x1d7d8, { C: 0x2102, H: 0x210d, N: 0x2115, P: 0x2119, Q: 0x211a, R: 0x211d, Z: 0x2124 }),
  },
  sans: { name: "𝖲𝖺𝗇𝗌", map: math(0x1d5a0, 0x1d5ba, 0x1d7e2) },
  sans_bold: { name: "𝗦𝗮𝗻𝘀 𝗕𝗼𝗹𝗱", map: math(0x1d5d4, 0x1d5ee, 0x1d7ec) },
  sans_italic: { name: "𝘚𝘢𝘯𝘴 𝘐𝘵𝘢𝘭𝘪𝘤", map: math(0x1d608, 0x1d622, null) },
  sans_bold_italic: { name: "𝙎𝙖𝙣𝙨 𝘽𝙤𝙡𝙙 𝙄𝙩𝙖𝙡𝙞𝙘", map: math(0x1d63c, 0x1d656, null) },
  monospace: { name: "𝙼𝚘𝚗𝚘𝚜𝚙𝚊𝚌𝚎", map: math(0x1d670, 0x1d68a, 0x1d7f6) },
  small_caps: { name: "ꜱᴍᴀʟʟ ᴄᴀᴘꜱ", map: SMALL_CAPS },
  circled: {
    name: "Ⓒⓘⓡⓒⓛⓔⓓ",
    map: (ch: string) => {
      const c = ch.charCodeAt(0);
      if (c >= 65 && c <= 90) return String.fromCodePoint(0x24b6 + c - 65);
      if (c >= 97 && c <= 122) return String.fromCodePoint(0x24d0 + c - 97);
      if (c === 48) return "⓪";
      if (c >= 49 && c <= 57) return String.fromCodePoint(0x2460 + c - 49);
      return ch;
    },
  },
  squared: {
    name: "🅂🅀🅄🄰🅁🄴🄳",
    map: (ch: string) => {
      const c = ch.toUpperCase().charCodeAt(0);
      return c >= 65 && c <= 90 && ch.length === 1 ? String.fromCodePoint(0x1f130 + c - 65) : ch;
    },
  },
  bubble_dark: {
    name: "🅑🅤🅑🅑🅛🅔",
    map: (ch: string) => {
      const c = ch.toUpperCase().charCodeAt(0);
      return c >= 65 && c <= 90 && ch.length === 1 ? String.fromCodePoint(0x1f150 + c - 65) : ch;
    },
  },
  wide: {
    name: "Ｗｉｄｅ",
    map: (ch: string) => {
      const c = ch.charCodeAt(0);
      if (ch === " ") return "　";
      return c >= 0x21 && c <= 0x7e ? String.fromCharCode(c + 0xfee0) : ch;
    },
  },
  upside_down: { name: "uʍop ǝpısdn", map: (ch: string) => UPSIDE[ch] ?? ch },
} satisfies Record<string, { name: string; map: Mapper }>;

export type FontName = keyof typeof fonts;

export const fontChoices = Object.entries(fonts).map(([value, f]) => ({ name: `${f.name} (${value.replace(/_/g, " ")})`, value }));

/**
 * Converts text into a fancy font. Leaves Discord syntax alone: mentions, channels,
 * custom emoji, timestamps, links, and :emoji_names:.
 */
export function fancy(text: string, font: string | null | undefined): string {
  const f = fonts[font as FontName];
  if (!f) return text;
  const protectedParts = /(<[@#:a&!/t][^>]*>|https?:\/\/\S+|:[\w~]{2,32}:)/g;
  const converted = text.split(protectedParts).map((part, i) =>
    i % 2 === 1 ? part : Array.from(part).map((ch) => f.map(ch)).join(""));
  return font === "upside_down" ? Array.from(converted.join("")).reverse().join("") : converted.join("");
}

export const dividers = {
  none: { name: "None", line: "" },
  stars: { name: "✦ Stars", line: "✦ ━━━━━━━━━━━━━━━━ ✦" },
  wolf: { name: "🐺 Wolf", line: "🐺 ━━━━━━━━━━━━━━ 🐺" },
  runes: { name: "ᚠ Norse runes", line: "ᛟ ═══════ ᚠ ᛖ ᚾ ᚱ ᛁ ᛋ ═══════ ᛟ" },
  sparkles: { name: "✨ Sparkles", line: "✨ ･ﾟ✧ ━━━━━━━━━━ ✧ﾟ･ ✨" },
  fire: { name: "🔥 Fire", line: "🔥━━━━━━━━━━━━━━━━🔥" },
  hearts: { name: "❤️ Hearts", line: "❤️ ━━━━━ ♡ ━━━━━ ❤️" },
  swords: { name: "⚔️ Swords", line: "⚔️ ━━━━━━━━━━━━━━ ⚔️" },
  dots: { name: "• Dots", line: "• • • • • • • • • • • • • •" },
} as const;

export type DividerName = keyof typeof dividers;

export const dividerChoices = Object.entries(dividers).map(([value, d]) => ({ name: d.name, value }));

/** Wraps text in a decorative divider above and below. */
export function withDivider(text: string, divider: string | null | undefined): string {
  const line = dividers[divider as DividerName]?.line;
  return line ? `${line}\n${text}\n${line}` : text;
}

/** Turns :name: into the server's custom emoji when it has one by that name. */
export function resolveCustomEmoji(text: string, emojis: Iterable<{ name: string | null; id: string; animated: boolean | null }>): string {
  const byName = new Map<string, string>();
  for (const e of emojis) if (e.name) byName.set(e.name.toLowerCase(), `<${e.animated ? "a" : ""}:${e.name}:${e.id}>`);
  return text.replace(/(<a?)?:([\w~]{2,32}):(\d+>)?/g, (whole, open, name, close) =>
    open || close ? whole : byName.get(name.toLowerCase()) ?? whole);
}
