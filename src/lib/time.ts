// Turns what people type ("tomorrow 8pm", "fri 7:30pm", "2026-11-14 20:00", "11/14 8pm")
// into a real moment in time, read in the server's configured time zone.

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

interface Parts { year: number; month: number; day: number; hour: number; minute: number; weekday: number }

function partsInZone(date: Date, timeZone: string): Parts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", weekday: "short",
  });
  const get = (type: string) => fmt.formatToParts(date).find((p) => p.type === type)!.value;
  return {
    year: +get("year"), month: +get("month"), day: +get("day"),
    hour: +get("hour") % 24, minute: +get("minute"),
    weekday: WEEKDAYS.indexOf(get("weekday").toLowerCase().slice(0, 3)),
  };
}

/** UTC instant for a wall-clock time in a time zone (handles daylight saving). */
export function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wall;
  for (let i = 0; i < 3; i++) {
    const p = partsInZone(new Date(guess), timeZone);
    const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    const diff = wall - seen;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

function parseTime(text: string): { hour: number; minute: number } | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, "");
  if (t === "noon") return { hour: 12, minute: 0 };
  if (t === "midnight") return { hour: 0, minute: 0 };
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?(am|pm|a|p)?$/);
  if (!m) return null;
  let hour = +m[1];
  const minute = m[2] ? +m[2] : 0;
  const suffix = m[3]?.[0];
  if (minute > 59) return null;
  if (suffix) {
    if (hour < 1 || hour > 12) return null;
    if (suffix === "p" && hour !== 12) hour += 12;
    if (suffix === "a" && hour === 12) hour = 0;
  } else if (hour > 23) {
    return null;
  }
  return { hour, minute };
}

/**
 * Parses a date and time typed by a person. Returns null if it can't be understood.
 * Date forms: today, tomorrow, a weekday name (next one), YYYY-MM-DD, MM/DD, MM/DD/YYYY.
 * Time forms: 8pm, 8:30pm, 20:00, noon, midnight. A time alone means the next time it comes up.
 */
export function parseDateTime(input: string, timeZone: string, now: Date = new Date()): Date | null {
  const text = input.trim().toLowerCase().replace(/\s+at\s+/, " ").replace(/,/g, " ").replace(/\s+/g, " ");
  const today = partsInZone(now, timeZone);

  const datePatterns: Array<[RegExp, (m: RegExpMatchArray) => { year: number; month: number; day: number } | null]> = [
    [/^(\d{4})-(\d{1,2})-(\d{1,2})/, (m) => ({ year: +m[1], month: +m[2], day: +m[3] })],
    [/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/, (m) => {
      let year = m[3] ? +m[3] : today.year;
      if (year < 100) year += 2000;
      const d = { year, month: +m[1], day: +m[2] };
      // No year given and the date already passed this year: assume next year.
      if (!m[3] && (d.month < today.month || (d.month === today.month && d.day < today.day))) d.year++;
      return d;
    }],
    [/^today/, () => ({ year: today.year, month: today.month, day: today.day })],
    [/^tomorrow/, () => addDays(today, 1)],
    [/^(sun|mon|tue|wed|thu|fri|sat)[a-z]*/, (m) => {
      const target = WEEKDAYS.indexOf(m[1]);
      let delta = (target - today.weekday + 7) % 7;
      if (delta === 0) delta = 7;
      return addDays(today, delta);
    }],
  ];

  for (const [re, toDate] of datePatterns) {
    const m = text.match(re);
    if (!m) continue;
    const date = toDate(m);
    const time = parseTime(text.slice(m[0].length));
    if (!date || !time) return null;
    if (date.month < 1 || date.month > 12 || date.day < 1 || date.day > 31) return null;
    const result = zonedToUtc(date.year, date.month, date.day, time.hour, time.minute, timeZone);
    // Reject impossible dates like 2/31 that roll over into another month.
    if (partsInZone(result, timeZone).day !== date.day) return null;
    return result;
  }

  // Just a time ("8pm"): today, or tomorrow if that time already passed.
  const time = parseTime(text);
  if (!time) return null;
  let result = zonedToUtc(today.year, today.month, today.day, time.hour, time.minute, timeZone);
  if (result.getTime() <= now.getTime()) {
    const t = addDays(today, 1);
    result = zonedToUtc(t.year, t.month, t.day, time.hour, time.minute, timeZone);
  }
  return result;
}

function addDays(p: { year: number; month: number; day: number }, days: number) {
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export const DATE_HELP = 'Try something like "tomorrow 8pm", "fri 7:30pm", "11/14 8pm", or "2026-11-14 20:00".';
