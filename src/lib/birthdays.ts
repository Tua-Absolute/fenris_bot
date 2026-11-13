import { JsonStore } from "./store.js";

export interface Birthday { month: number; day: number; year?: number }
// guildId -> userId -> birthday
const store = new JsonStore<Record<string, Record<string, Birthday>>>("birthdays", {});
// guildId -> userId -> "YYYY-MM-DD" of the last announcement (so restarts never double-post)
const announced = new JsonStore<Record<string, Record<string, string>>>("birthdays-announced", {});

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const monthChoices = MONTHS.map((name, i) => ({ name, value: i + 1 }));
export const formatBirthday = (b: Birthday) => `${MONTHS[b.month - 1]} ${b.day}`;

export function validDate(month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= DAYS_IN[month - 1];
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Whether a birthday falls on this local date. Feb 29 birthdays are celebrated on Feb 28 in other years. */
export function isBirthdayOn(b: Birthday, year: number, month: number, day: number): boolean {
  if (b.month === 2 && b.day === 29 && !isLeap(year)) return month === 2 && day === 28;
  return b.month === month && b.day === day;
}

/** Days from (month, day) until the next birthday, 0 = today. */
export function daysUntil(b: Birthday, year: number, month: number, day: number): number {
  const today = Date.UTC(year, month - 1, day);
  for (let y = year; y <= year + 1; y++) {
    const d = b.month === 2 && b.day === 29 && !isLeap(y) ? 28 : b.day;
    const t = Date.UTC(y, b.month - 1, d);
    if (t >= today) return Math.round((t - today) / 86_400_000);
  }
  return 365;
}

export function getBirthday(guildId: string, userId: string): Birthday | undefined {
  return store.data[guildId]?.[userId];
}

export function allBirthdays(guildId: string): [string, Birthday][] {
  return Object.entries(store.data[guildId] ?? {});
}

export async function setBirthday(guildId: string, userId: string, b: Birthday) {
  (store.data[guildId] ??= {})[userId] = b;
  await store.save();
}

export async function removeBirthday(guildId: string, userId: string): Promise<boolean> {
  if (!store.data[guildId]?.[userId]) return false;
  delete store.data[guildId][userId];
  await store.save();
  return true;
}

export function wasAnnounced(guildId: string, userId: string, date: string): boolean {
  return announced.data[guildId]?.[userId] === date;
}

export async function markAnnounced(guildId: string, userId: string, date: string) {
  (announced.data[guildId] ??= {})[userId] = date;
  await announced.save();
}
