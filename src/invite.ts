// Prints the link that adds the bot to a server with the permissions it needs.
import { OAuth2Scopes, PermissionFlagsBits } from "discord.js";
import { config } from "./config.js";

const p = PermissionFlagsBits;
const permissions = [
  p.ViewChannel,
  p.SendMessages,
  p.EmbedLinks,
  p.AttachFiles,
  p.ReadMessageHistory,
  p.AddReactions,
  p.UseExternalEmojis,
  p.MentionEveryone,
  p.SendPolls,
  p.CreateEvents,
  p.ManageEvents,
].reduce((a, b) => a | b, 0n);

const url = new URL("https://discord.com/oauth2/authorize");
url.searchParams.set("client_id", config.clientId());
url.searchParams.set("scope", [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands].join(" "));
url.searchParams.set("permissions", permissions.toString());

console.log(url.toString());
