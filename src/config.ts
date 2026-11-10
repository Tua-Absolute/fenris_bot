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
};
