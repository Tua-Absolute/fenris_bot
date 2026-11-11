// Things Claude can propose doing in the server. Nothing runs until a person with the
// right permission clicks Confirm.
import {
  ChannelType,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  PermissionFlagsBits,
  type EmbedBuilder,
  type Guild,
  type GuildTextBasedChannel,
} from "discord.js";
import type Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { brandEmbed, colorFor, colors, discordTime } from "../lib/brand.js";
import { UserError } from "../lib/files.js";
import { DATE_HELP, parseDateTime } from "../lib/time.js";

export interface AnnouncementInput { channel_id: string; title: string; body: string; color?: string; ping?: "none" | "here" | "everyone" }
export interface EventInput { name: string; start: string; hours?: number; location?: string; voice_channel_id?: string; description?: string }
export interface PollInput { channel_id: string; question: string; answers: string[]; hours?: number; multiple?: boolean }

export type Action =
  | { kind: "announcement"; input: AnnouncementInput }
  | { kind: "event"; input: EventInput }
  | { kind: "poll"; input: PollInput };

export const tools: Anthropic.Beta.BetaTool[] = [
  {
    name: "propose_announcement",
    description: "Propose posting a styled announcement embed. The user sees a preview and must confirm before it posts. Write a punchy title and an engaging, well-formatted body using Discord markdown and a few fitting emoji.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        channel_id: { type: "string", description: "ID of the text channel to post in, from the channel list. Use the current channel if the user didn't say." },
        title: { type: "string", description: "Headline, under 100 characters" },
        body: { type: "string", description: "Announcement text, Discord markdown allowed, under 1500 characters" },
        color: { type: "string", enum: ["red", "ember", "gold", "blue", "green", "purple", "white"] },
        ping: { type: "string", enum: ["none", "here", "everyone"], description: "Only ping if the user asked for it" },
      },
      required: ["channel_id", "title", "body", "color", "ping"],
    },
  },
  {
    name: "propose_event",
    description: "Propose creating an event on the server's Discord calendar. The user must confirm before it is created.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string", description: "Event name, under 100 characters" },
        start: { type: "string", description: "Start in the server's local time, formatted exactly YYYY-MM-DD HH:MM (24-hour)" },
        hours: { type: "number", description: "Duration in hours (default 2)" },
        location: { type: "string", description: "A place or link, if not in a voice channel. Empty string if a voice channel is used." },
        voice_channel_id: { type: "string", description: "ID of a voice channel from the list to hold it in, or empty string" },
        description: { type: "string", description: "Short event description, under 500 characters" },
      },
      required: ["name", "start", "hours", "location", "voice_channel_id", "description"],
    },
  },
  {
    name: "propose_poll",
    description: "Propose starting a native Discord poll. The user must confirm before it posts.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        channel_id: { type: "string", description: "ID of the text channel to post in; use the current channel if unspecified" },
        question: { type: "string", description: "The poll question, under 300 characters" },
        answers: { type: "array", items: { type: "string" }, description: "2 to 10 answers, each under 55 characters" },
        hours: { type: "number", description: "How long voting stays open (1 to 768, default 24)" },
        multiple: { type: "boolean", description: "Allow picking more than one answer" },
      },
      required: ["channel_id", "question", "answers", "hours", "multiple"],
    },
  },
];

export function toAction(name: string, input: unknown): Action | null {
  if (name === "propose_announcement") return { kind: "announcement", input: input as AnnouncementInput };
  if (name === "propose_event") return { kind: "event", input: input as EventInput };
  if (name === "propose_poll") return { kind: "poll", input: input as PollInput };
  return null;
}

export const requiredPermission = {
  announcement: { flag: PermissionFlagsBits.ManageMessages, label: "Manage Messages" },
  event: { flag: PermissionFlagsBits.ManageEvents, label: "Manage Events" },
  poll: { flag: PermissionFlagsBits.SendPolls, label: "Create Polls" },
} as const;

function textChannel(guild: Guild, id: string): GuildTextBasedChannel {
  const ch = guild.channels.cache.get(id);
  if (!ch || !ch.isTextBased() || ch.isVoiceBased()) throw new UserError("I couldn't find that text channel.");
  return ch as GuildTextBasedChannel;
}

function announcementEmbed(guild: Guild, a: AnnouncementInput): EmbedBuilder {
  return brandEmbed(colorFor(a.color))
    .setAuthor({ name: guild.name, iconURL: guild.iconURL() ?? undefined })
    .setTitle(a.title.slice(0, 256))
    .setDescription(a.body.slice(0, 4000));
}

/** Checks the proposal and builds the preview shown above the Confirm button. */
export function preview(guild: Guild, action: Action): { summary: string; embed: EmbedBuilder } {
  switch (action.kind) {
    case "announcement": {
      const a = action.input;
      const ch = textChannel(guild, a.channel_id);
      const ping = a.ping && a.ping !== "none" ? ` and ping @${a.ping}` : "";
      return { summary: `Post this announcement in <#${ch.id}>${ping}?`, embed: announcementEmbed(guild, a) };
    }
    case "event": {
      const e = action.input;
      const start = parseDateTime(e.start, config.timezone());
      if (!start) throw new UserError(`I couldn't work out the start time. ${DATE_HELP}`);
      if (start.getTime() < Date.now()) throw new UserError("That event time is in the past.");
      const where = e.voice_channel_id ? `<#${e.voice_channel_id}>` : e.location || "See event details";
      return {
        summary: "Create this event on the server calendar?",
        embed: brandEmbed(colors.red).setTitle(`📅 ${e.name}`).setDescription([
          e.description,
          "",
          `**When:** ${discordTime(start)} (${e.hours || 2} h)`,
          `**Where:** ${where}`,
        ].join("\n")),
      };
    }
    case "poll": {
      const p = action.input;
      const ch = textChannel(guild, p.channel_id);
      if (p.answers.length < 2 || p.answers.length > 10) throw new UserError("A poll needs between 2 and 10 answers.");
      return {
        summary: `Start this poll in <#${ch.id}>?`,
        embed: brandEmbed(colors.red).setTitle(`📊 ${p.question}`).setDescription(
          p.answers.map((a, i) => `${i + 1}. ${a}`).join("\n") +
          `\n\nOpen for ${p.hours || 24} h${p.multiple ? " · multiple choice" : ""}`),
      };
    }
  }
}

/** Carries out a confirmed proposal. Returns a link to the result. */
export async function execute(guild: Guild, action: Action): Promise<string> {
  switch (action.kind) {
    case "announcement": {
      const a = action.input;
      const ch = textChannel(guild, a.channel_id);
      const ping = a.ping === "here" || a.ping === "everyone";
      const msg = await ch.send({
        content: ping ? `@${a.ping}` : undefined,
        embeds: [announcementEmbed(guild, a)],
        allowedMentions: { parse: ping ? ["everyone"] : [] },
      });
      return msg.url;
    }
    case "event": {
      const e = action.input;
      const start = parseDateTime(e.start, config.timezone())!;
      const end = new Date(start.getTime() + Math.min(Math.max(e.hours || 2, 0.25), 72) * 3_600_000);
      const voice = e.voice_channel_id ? guild.channels.cache.get(e.voice_channel_id) : undefined;
      const isVoice = voice?.type === ChannelType.GuildVoice || voice?.type === ChannelType.GuildStageVoice;
      const created = await guild.scheduledEvents.create({
        name: e.name.slice(0, 100),
        description: e.description?.slice(0, 1000) || undefined,
        scheduledStartTime: start,
        scheduledEndTime: end,
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        ...(isVoice
          ? {
            entityType: voice!.type === ChannelType.GuildStageVoice
              ? GuildScheduledEventEntityType.StageInstance
              : GuildScheduledEventEntityType.Voice,
            channel: voice!.id,
          }
          : {
            entityType: GuildScheduledEventEntityType.External,
            entityMetadata: { location: e.location || "See event details" },
          }),
      });
      return created.url;
    }
    case "poll": {
      const p = action.input;
      const ch = textChannel(guild, p.channel_id);
      const msg = await ch.send({
        poll: {
          question: { text: p.question.slice(0, 300) },
          answers: p.answers.slice(0, 10).map((text) => ({ text: text.slice(0, 55) })),
          duration: Math.min(Math.max(Math.round(p.hours || 24), 1), 768),
          allowMultiselect: !!p.multiple,
        },
      });
      return msg.url;
    }
  }
}
