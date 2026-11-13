// Reads a birthday out of plain chat text without Claude, e.g. "my birthday is March 3rd" or "bday 3/14".

const MONTH_WORDS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const MONTH = `(${Object.keys(MONTH_WORDS).sort((a, b) => b.length - a.length).join("|")})\\.?`;
const DAY = "(\\d{1,2})(?:st|nd|rd|th)?";

export type BirthdayIntent =
  | { kind: "set"; month: number; day: number }
  | { kind: "remove" }
  | { kind: "show" }
  | { kind: "unclear" } // talks about a birthday but no date we could read
  | { kind: "none" };   // not about birthdays

export const mentionsBirthday = (text: string) => /\b(birthday|bday|b-day|born)\b/i.test(text);

/** Finds a month and day in the text, or null. Numbers are read US-style (month/day) unless that's impossible. */
export function findDate(text: string): { month: number; day: number } | null {
  const t = text.toLowerCase();
  let m = new RegExp(`\\b${MONTH}\\s+(?:the\\s+)?${DAY}\\b`).exec(t);
  if (m) return { month: MONTH_WORDS[m[1]], day: Number(m[2]) };
  m = new RegExp(`\\b${DAY}\\s+(?:of\\s+)?${MONTH}(?![a-z])`).exec(t);
  if (m) return { month: MONTH_WORDS[m[2]], day: Number(m[1]) };
  m = /\b(\d{1,2})[/\-.](\d{1,2})(?:[/\-.]\d{2,4})?\b/.exec(t);
  if (m) {
    let [a, b] = [Number(m[1]), Number(m[2])];
    if (a > 12 && b <= 12) [a, b] = [b, a]; // clearly day/month, like 25/12
    return { month: a, day: b };
  }
  return null;
}

/**
 * Works out what someone wants from a message to Fenris.
 * `replyToBot` lets a bare date ("March 3") count when they're answering Fenris directly.
 */
export function readBirthdayIntent(text: string, replyToBot = false): BirthdayIntent {
  const clean = text.replace(/<[@#][!&]?\d+>/g, " ").trim();
  const about = mentionsBirthday(clean);
  if (about && /\b(forget|remove|delete|clear|erase|unset)\b/i.test(clean)) return { kind: "remove" };
  const date = findDate(clean);
  if (date && (about || replyToBot)) return { kind: "set", ...date };
  if (about && /\b(what|when|show|check|view|is my)\b/i.test(clean) && !/\bmy (birthday|bday|b-day) is\b/i.test(clean)) return { kind: "show" };
  if (about) return { kind: "unclear" };
  return { kind: "none" };
}
