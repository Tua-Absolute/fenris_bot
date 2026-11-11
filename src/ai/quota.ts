import { config } from "../config.js";

let day = "";
let usedToday = 0;

/** Uses one Claude request from today's budget (CHAT_DAILY_LIMIT). Returns false when the budget is spent. */
export function takeQuota(cost = 1): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; usedToday = 0; }
  if (usedToday + cost > config.chatDailyLimit()) return false;
  usedToday += cost;
  return true;
}
