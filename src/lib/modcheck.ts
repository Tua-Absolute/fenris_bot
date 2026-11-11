import type { ChatInputCommandInteraction, GuildMember } from "discord.js";
import { UserError } from "./files.js";

/** Fetches the target member and makes sure the moderator is allowed to act on them. */
export async function targetMember(interaction: ChatInputCommandInteraction, option = "user"): Promise<GuildMember> {
  const guild = interaction.guild!;
  const user = interaction.options.getUser(option, true);
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) throw new UserError("That person isn't in this server.");
  if (member.id === interaction.user.id) throw new UserError("You can't use that on yourself.");
  if (member.id === guild.ownerId) throw new UserError("The server owner can't be moderated.");
  if (member.id === interaction.client.user.id) throw new UserError("Nice try. 🐺");
  const mod = await guild.members.fetch(interaction.user.id);
  if (mod.id !== guild.ownerId && member.roles.highest.comparePositionTo(mod.roles.highest) >= 0) {
    throw new UserError("They have the same or a higher role than you.");
  }
  return member;
}
