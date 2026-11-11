import { EmbedBuilder } from "discord.js";

/** Fenris palette. Red and black first; the rest are for variety. */
export const colors = {
  red: 0xc8102e,
  ember: 0xff2236,
  gold: 0xe8b84a,
  blue: 0x3b82f6,
  green: 0x22c55e,
  purple: 0x8b5cf6,
  white: 0xf2f2f4,
} as const;

export type ColorName = keyof typeof colors;

export const colorChoices = [
  { name: "Fenris Red (default)", value: "red" },
  { name: "Ember", value: "ember" },
  { name: "Gold", value: "gold" },
  { name: "Blue", value: "blue" },
  { name: "Green", value: "green" },
  { name: "Purple", value: "purple" },
  { name: "White", value: "white" },
] as const;

export function colorFor(name: string | null | undefined): number {
  return colors[(name ?? "red") as ColorName] ?? colors.red;
}

/** An embed with Fenris defaults already applied. */
export function brandEmbed(color: number = colors.red): EmbedBuilder {
  return new EmbedBuilder().setColor(color).setTimestamp();
}

/** Discord timestamp markup that shows in each viewer's own time zone. */
export function discordTime(date: Date, style: "F" | "R" | "f" | "t" | "D" = "F"): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}
