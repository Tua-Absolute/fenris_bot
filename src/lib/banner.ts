// Generates banner images (announcement banners, event covers) for free, on your own computer:
// angular low-poly art in a chosen palette, the Fenris emblem, and crisp title text.
import { Resvg } from "@resvg/resvg-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const assets = (p: string) => fileURLToPath(new URL(`../../assets/${p}`, import.meta.url));

export const bannerStyles = {
  fenris: { name: "Fenris (red & black)", dark: "#070708", mid: "#1a0a0d", hi: "#c8102e", text: "#f4f4f6", accent: "#ff2236" },
  ember: { name: "Ember", dark: "#120404", mid: "#4a0d0d", hi: "#ff5a1f", text: "#fff3ec", accent: "#ffb020" },
  frost: { name: "Frost", dark: "#050a14", mid: "#10213d", hi: "#5cc8ff", text: "#eef7ff", accent: "#9be3ff" },
  gold: { name: "Gold", dark: "#080706", mid: "#241c0c", hi: "#e8b84a", text: "#fbf6ea", accent: "#e8b84a" },
  night: { name: "Night", dark: "#07060d", mid: "#1d1338", hi: "#8b5cf6", text: "#f3f0ff", accent: "#c4b5fd" },
} as const;

export type BannerStyle = keyof typeof bannerStyles;

export const bannerStyleChoices = Object.entries(bannerStyles).map(([value, s]) => ({ name: s.name, value }));

export interface BannerOptions {
  title: string;
  subtitle?: string;
  style?: string;
  width?: number;
  height?: number;
  /** Show an emblem on the right (default true). */
  logo?: boolean;
  /** PNG/JPG/WebP image (e.g. the server icon) to use as the emblem instead of the Fenris wolf. */
  emblemImage?: Buffer;
}

// Small seeded random generator so the same title always gives the same art.
function rng(seedText: string) {
  let h = 2166136261;
  for (const ch of seedText) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * Math.min(Math.max(t, 0), 1));
  return `rgb(${c(r1, r2)},${c(g1, g2)},${c(b1, b2)})`;
}

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Splits text into at most `maxLines` lines that fit `maxWidth` at `size` px (Inter Display Bold estimate). */
export function wrapText(text: string, size: number, maxWidth: number, maxLines: number): string[] | null {
  const charW = size * 0.56;
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length * charW <= maxWidth) line = next;
    else {
      if (!line || word.length * charW > maxWidth) return null;
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length <= maxLines ? lines : null;
}

let emblem: string | null = null;
function emblemSvg(): string {
  if (emblem === null) {
    // Reuse the logo, renaming its ids so they can't clash with the banner's own.
    emblem = readFileSync(assets("branding/fenris-icon.svg"), "utf8")
      .replace(/<\?xml[^>]*>/, "")
      .replace(/id="(\w+)"/g, 'id="logo-$1"')
      .replace(/url\(#(\w+)\)/g, "url(#logo-$1)");
  }
  return emblem;
}

export function bannerSvg(opts: BannerOptions): string {
  const W = opts.width ?? 1600;
  const H = opts.height ?? 640;
  const s = bannerStyles[(opts.style ?? "fenris") as BannerStyle] ?? bannerStyles.fenris;
  const rand = rng(`${opts.title}|${opts.style}`);

  // Low-poly background: a jittered grid split into triangles, darker on the left (behind the text).
  const cols = 14, rows = 6;
  const cw = W / cols, rh = H / rows;
  const pts: [number, number][][] = [];
  for (let r = 0; r <= rows; r++) {
    pts.push([]);
    for (let c = 0; c <= cols; c++) {
      const edgeX = c === 0 || c === cols, edgeY = r === 0 || r === rows;
      pts[r].push([
        c * cw + (edgeX ? 0 : (rand() - 0.5) * cw * 0.8),
        r * rh + (edgeY ? 0 : (rand() - 0.5) * rh * 0.8),
      ]);
    }
  }
  const tris: string[] = [];
  const shade = (x: number, y: number) => {
    const t = Math.pow(x / W, 1.6) * 0.85 + (y / H) * 0.25 + (rand() - 0.5) * 0.18;
    if (rand() < 0.05 && x > W * 0.6) return mix(s.mid, s.hi, 0.55 + rand() * 0.35); // occasional bright shard
    return t < 0.5 ? mix(s.dark, s.mid, t * 2) : mix(s.mid, s.hi, (t - 0.5) * 0.9);
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = pts[r][c], b = pts[r][c + 1], d = pts[r + 1][c], e = pts[r + 1][c + 1];
      const flip = rand() < 0.5;
      const pair = flip ? [[a, b, e], [a, e, d]] : [[a, b, d], [b, e, d]];
      for (const tri of pair) {
        const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
        const cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
        const fill = shade(cx, cy);
        tris.push(`<polygon points="${tri.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" ")}" fill="${fill}" stroke="${fill}" stroke-width="1"/>`);
      }
    }
  }

  // Title: the largest size that fits in two lines, or three lines for long titles.
  const logo = opts.logo ?? true;
  const textWidth = W * (logo ? 0.6 : 0.86);
  let size = 132, lines: string[] | null = null;
  for (; size >= 56; size -= 4) {
    lines = wrapText(opts.title, size, textWidth, size >= 76 ? 2 : 3);
    if (lines) break;
  }
  if (!lines) {
    size = 56;
    const max = Math.floor(textWidth / (size * 0.56));
    lines = [opts.title.slice(0, max - 1) + "…"];
  }
  const lineH = size * 1.08;
  const sub = opts.subtitle?.trim();
  const blockH = lines.length * lineH + (sub ? 90 : 0);
  let y = (H - blockH) / 2 + size * 0.85;
  const x = W * 0.07;
  const titleSvg = lines.map((l, i) =>
    `<text x="${x}" y="${(y + i * lineH).toFixed(1)}" font-family="Inter Display" font-weight="700" font-size="${size}" fill="${s.text}">${escapeXml(l)}</text>`).join("");
  y += (lines.length - 1) * lineH;
  const subSvg = sub
    ? `<rect x="${x}" y="${(y + 34).toFixed(1)}" width="72" height="6" fill="${s.accent}"/>
       <text x="${x + 96}" y="${(y + 58).toFixed(1)}" font-family="Inter Display" font-weight="500" font-size="40" letter-spacing="3" fill="${s.accent}">${escapeXml(sub.slice(0, 60).toUpperCase())}</text>`
    : "";

  const logoSize = H * 0.78;
  const lx = W - logoSize - W * 0.05, ly = (H - logoSize) / 2;
  const r = logoSize / 2, cx = lx + r, cy = ly + r;
  let logoSvg = "";
  if (logo && opts.emblemImage) {
    // Custom emblem (server icon): clipped to a circle with a ring in the style's color.
    const mime = sniffMime(opts.emblemImage);
    logoSvg = `<clipPath id="bn-clip"><circle cx="${cx}" cy="${cy}" r="${r * 0.9}"/></clipPath>
      <circle cx="${cx}" cy="${cy}" r="${r * 0.97}" fill="${s.dark}"/>
      <image href="data:${mime};base64,${opts.emblemImage.toString("base64")}" x="${cx - r * 0.9}" y="${cy - r * 0.9}" width="${r * 1.8}" height="${r * 1.8}" preserveAspectRatio="xMidYMid slice" clip-path="url(#bn-clip)"/>
      <circle cx="${cx}" cy="${cy}" r="${r * 0.93}" fill="none" stroke="${s.hi}" stroke-width="${r * 0.04}"/>`;
  } else if (logo) {
    logoSvg = `<g transform="translate(${lx} ${ly}) scale(${logoSize / 512})">${emblemSvg()}</g>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bn-fade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#000" stop-opacity=".55"/>
      <stop offset=".6" stop-color="#000" stop-opacity=".15"/>
      <stop offset="1" stop-color="#000" stop-opacity="0"/>
    </linearGradient>
  </defs>
  ${tris.join("")}
  <rect width="${W}" height="${H}" fill="url(#bn-fade)"/>
  <rect x="0" y="${H - 10}" width="${W}" height="10" fill="${s.hi}"/>
  ${logoSvg}
  ${titleSvg}
  ${subSvg}
</svg>`;
}

function sniffMime(buf: Buffer): string {
  if (buf.subarray(0, 4).toString("hex") === "89504e47") return "image/png";
  if (buf.subarray(0, 3).toString("hex") === "ffd8ff") return "image/jpeg";
  if (buf.subarray(0, 4).toString() === "GIF8") return "image/gif";
  if (buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return "image/png";
}

/** Renders a banner to PNG bytes. */
export function renderBanner(opts: BannerOptions): Buffer {
  const resvg = new Resvg(bannerSvg(opts), {
    font: {
      fontFiles: [assets("fonts/InterDisplay-Bold.otf"), assets("fonts/InterDisplay-Medium.otf")],
      loadSystemFonts: false,
      defaultFontFamily: "Inter Display",
    },
  });
  return resvg.render().asPng();
}
