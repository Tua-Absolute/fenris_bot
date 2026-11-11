import type {
  ContextMenuCommandBuilder,
  MessageContextMenuCommandInteraction,
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";

export interface Command {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  /** Suggestions while the user is typing an option marked .setAutocomplete(true). */
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
  /** Handles modals whose customId starts with "<command name>:". */
  handleModal?: (interaction: ModalSubmitInteraction) => Promise<void>;
  /** Handles buttons whose customId starts with "<command name>:". */
  handleButton?: (interaction: ButtonInteraction) => Promise<void>;
}

/** A right-click (Apps) command on a message. */
export interface MessageMenu {
  data: ContextMenuCommandBuilder;
  execute: (interaction: MessageContextMenuCommandInteraction) => Promise<void>;
}
