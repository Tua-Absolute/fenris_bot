import {
  ActionRowBuilder,
  ChannelType,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { bannerStyleChoices } from "../lib/banner.js";
import { brandEmbed, colors } from "../lib/brand.js";
import { DEFAULT_WELCOME, getSettings, updateSettings } from "../lib/settings.js";
import type { Command } from "./types.js";

const textChannel = [ChannelType.GuildText, ChannelType.GuildAnnouncement] as const;
const show = (id?: string, kind: "#" | "@&" = "#") => (id ? `<${kind}${id}>` : "not set");

export const settings: Command = {
  data: new SlashCommandBuilder()
    .setName("settings")
    .setDescription("Configure Fenris for this server.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName("view").setDescription("Show the current settings."))
    .addSubcommand((s) => s.setName("welcome").setDescription("Welcome new members with a card (leave channel empty to turn off).")
      .addChannelOption((o) => o.setName("channel").setDescription("Where welcome cards go").addChannelTypes(...textChannel))
      .addStringOption((o) => o.setName("message").setDescription("Use {user}, {name}, {server}, {count}").setMaxLength(500))
      .addStringOption((o) => o.setName("style").setDescription("Card style").addChoices(...bannerStyleChoices))
      .addRoleOption((o) => o.setName("auto_role").setDescription("Give every new member this role"))
      .addBooleanOption((o) => o.setName("off").setDescription("Turn welcome cards and auto-role off")))
    .addSubcommand((s) => s.setName("modlog").setDescription("Choose the channel that logs deletes, edits, joins, leaves, and mod actions.")
      .addChannelOption((o) => o.setName("channel").setDescription("Mod log channel (leave empty to turn off)").addChannelTypes(...textChannel)))
    .addSubcommand((s) => s.setName("tickets").setDescription("Set up support tickets.")
      .addChannelOption((o) => o.setName("category").setDescription("Category where ticket channels are created").addChannelTypes(ChannelType.GuildCategory).setRequired(true))
      .addRoleOption((o) => o.setName("staff_role").setDescription("Role that can see and answer tickets").setRequired(true)))
    .addSubcommand((s) => s.setName("levels").setDescription("Turn XP and levels on or off.")
      .addBooleanOption((o) => o.setName("enabled").setDescription("Give XP for chatting").setRequired(true))
      .addChannelOption((o) => o.setName("announce_in").setDescription("Where level-ups are announced (default: same channel)").addChannelTypes(...textChannel)))
    .addSubcommand((s) => s.setName("level_role").setDescription("Give a role when members reach a level.")
      .addIntegerOption((o) => o.setName("level").setDescription("Level").setMinValue(1).setMaxValue(200).setRequired(true))
      .addRoleOption((o) => o.setName("role").setDescription("Role to give (leave empty to remove the reward)")))
    .addSubcommand((s) => s.setName("reminders").setDescription("Post reminders before calendar events start.")
      .addChannelOption((o) => o.setName("channel").setDescription("Where reminders go (leave empty to turn off)").addChannelTypes(...textChannel)))
    .addSubcommand((s) => s.setName("recap").setDescription("Have Claude post a weekly recap every Sunday evening.")
      .addChannelOption((o) => o.setName("channel").setDescription("Where the recap goes (leave empty to turn off)").addChannelTypes(...textChannel)))
    .addSubcommand((s) => s.setName("faq").setDescription("Write the server FAQ that Fenris uses to answer questions.")),

  async execute(interaction) {
    const guildId = interaction.guildId!;
    const sub = interaction.options.getSubcommand();
    const s = getSettings(guildId);
    const reply = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

    switch (sub) {
      case "view": {
        const levelRoles = Object.entries(s.levelRoles ?? {}).map(([lvl, id]) => `L${lvl} → <@&${id}>`).join(", ") || "none";
        const embed = brandEmbed(colors.red).setTitle("Fenris settings").addFields(
          { name: "Welcome", value: `${show(s.welcomeChannelId)} · style ${s.welcomeStyle ?? "fenris"} · auto-role ${show(s.autoRoleId, "@&")}\n${s.welcomeMessage ?? DEFAULT_WELCOME}` },
          { name: "Mod log", value: show(s.modLogChannelId), inline: true },
          { name: "Event reminders", value: show(s.eventRemindersChannelId), inline: true },
          { name: "Weekly recap", value: show(s.recapChannelId), inline: true },
          { name: "Tickets", value: s.ticketCategoryId ? `category ${show(s.ticketCategoryId)}, staff ${show(s.ticketStaffRoleId, "@&")}` : "not set up" },
          { name: "Levels", value: `${s.levelsEnabled ? "on" : "off"} · announce in ${s.levelUpChannelId ? show(s.levelUpChannelId) : "same channel"}\nRewards: ${levelRoles}` },
          { name: "FAQ", value: s.faq ? `${s.faq.length} characters (edit with /settings faq)` : "empty" },
        );
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        return;
      }
      case "welcome": {
        if (interaction.options.getBoolean("off")) {
          await updateSettings(guildId, { welcomeChannelId: undefined, autoRoleId: undefined });
          await reply("Welcome cards and auto-role are off.");
          return;
        }
        const role = interaction.options.getRole("auto_role");
        if (role && (role.managed || role.id === guildId)) {
          await reply("That role can't be given out automatically. Pick a normal role.");
          return;
        }
        await updateSettings(guildId, {
          welcomeChannelId: interaction.options.getChannel("channel")?.id ?? s.welcomeChannelId,
          welcomeMessage: interaction.options.getString("message") ?? s.welcomeMessage,
          welcomeStyle: interaction.options.getString("style") ?? s.welcomeStyle,
          autoRoleId: role?.id ?? s.autoRoleId,
        });
        const now = getSettings(guildId);
        await reply(`Welcome cards go to ${show(now.welcomeChannelId)}${now.autoRoleId ? ` and new members get <@&${now.autoRoleId}>` : ""}. ` +
          "Make sure **Server Members Intent** is on in the Developer Portal, and that my role is above any auto-role.");
        return;
      }
      case "modlog": {
        const ch = interaction.options.getChannel("channel");
        await updateSettings(guildId, { modLogChannelId: ch?.id });
        await reply(ch ? `Mod log is now ${show(ch.id)}.` : "Mod log is off.");
        return;
      }
      case "tickets": {
        await updateSettings(guildId, {
          ticketCategoryId: interaction.options.getChannel("category", true).id,
          ticketStaffRoleId: interaction.options.getRole("staff_role", true).id,
        });
        await reply("Tickets are set up. Post the \"Open a ticket\" button with `/ticket panel`.");
        return;
      }
      case "levels": {
        await updateSettings(guildId, {
          levelsEnabled: interaction.options.getBoolean("enabled", true),
          levelUpChannelId: interaction.options.getChannel("announce_in")?.id ?? s.levelUpChannelId,
        });
        await reply(`XP and levels are ${getSettings(guildId).levelsEnabled ? "on" : "off"}.`);
        return;
      }
      case "level_role": {
        const level = interaction.options.getInteger("level", true);
        const role = interaction.options.getRole("role");
        const levelRoles = { ...(s.levelRoles ?? {}) };
        if (role) levelRoles[level] = role.id; else delete levelRoles[level];
        await updateSettings(guildId, { levelRoles });
        await reply(role ? `Members reaching level ${level} get <@&${role.id}>.` : `Removed the level ${level} reward.`);
        return;
      }
      case "reminders": {
        const ch = interaction.options.getChannel("channel");
        await updateSettings(guildId, { eventRemindersChannelId: ch?.id });
        await reply(ch ? `Event reminders (1 day and 1 hour before) go to ${show(ch.id)}.` : "Event reminders are off.");
        return;
      }
      case "recap": {
        const ch = interaction.options.getChannel("channel");
        await updateSettings(guildId, { recapChannelId: ch?.id });
        await reply(ch ? `Claude will post a weekly recap in ${show(ch.id)} every Sunday at 6 PM.` : "Weekly recap is off.");
        return;
      }
      case "faq": {
        const modal = new ModalBuilder().setCustomId("settings:faq").setTitle("Server FAQ").addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId("faq").setLabel("Rules, info, and common questions")
              .setStyle(TextInputStyle.Paragraph).setMaxLength(4000).setRequired(false)
              .setPlaceholder("Q: When are game nights?\nA: Fridays at 8 PM Central.\n...")
              .setValue(s.faq ?? "")),
        );
        await interaction.showModal(modal);
        return;
      }
    }
  },

  async handleModal(interaction) {
    const faq = interaction.fields.getTextInputValue("faq").trim();
    await updateSettings(interaction.guildId!, { faq: faq || undefined });
    await interaction.reply({ content: faq ? "FAQ saved. Fenris will use it when answering questions." : "FAQ cleared.", flags: MessageFlags.Ephemeral });
  },
};
