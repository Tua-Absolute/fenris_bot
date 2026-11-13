import "dotenv/config";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
  }
  return value;
}

export const config = {
  token: () => required("DISCORD_TOKEN"),
  clientId: () => required("DISCORD_CLIENT_ID"),
  guildId: () => required("DISCORD_GUILD_ID"),
  /** Time zone used to read times typed into commands like /event. */
  timezone: () => process.env.TIMEZONE?.trim() || "America/Chicago",
  /** Claude chat is on only when an API key is set. */
  chatEnabled: () => !!process.env.ANTHROPIC_API_KEY?.trim(),
  claudeModel: () => process.env.CLAUDE_MODEL?.trim() || "claude-opus-5-5",
  chatDailyLimit: () => Number(process.env.CHAT_DAILY_LIMIT) || 200,
  /**
   * Servers where Claude features (chat, /catchup, /recap, weekly recap) work: your home server
   * (DISCORD_GUILD_ID) plus any extra IDs in CHAT_GUILD_IDS. Everywhere else, Claude stays off,
   * so other servers that add Fenris can't spend your Anthropic credit.
   */
  claudeServers: () => new Set([
    required("DISCORD_GUILD_ID"),
    ...(process.env.CHAT_GUILD_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean),
  ]),
};

/** True when Claude is set up and allowed in this server. */
export function claudeAllowedIn(guildId: string | null | undefined): boolean {
  return config.chatEnabled() && !!guildId && config.claudeServers().has(guildId);
}
