// Things Claude can propose doing in the server. Nothing runs until a person with the
// right permission clicks Confirm.
import {
  AttachmentBuilder,
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
import { buildAnnouncement, type AnnouncementData } from "../lib/announcement.js";
import { bannerStyles, renderBanner } from "../lib/banner.js";
import { dividers, fonts } from "../lib/fonts.js";
import { addScheduled } from "../lib/schedule.js";
import { brandEmbed, colorFor, colors, discordTime } from "../lib/brand.js";
import { UserError } from "../lib/files.js";
import { serverIcon } from "../lib/serverIcon.js";
import { DATE_HELP, formatShort, parseDateTime, repeatLabel, type Repeat } from "../lib/time.js";

export interface AnnouncementInput { channel_id: string; title: string; body: string; color?: string; ping?: "none" | "here" | "everyone"; banner_style?: string; title_font?: string; divider?: string; post_at?: string; repeat?: string }
export interface EventInput { name: string; start: string; hours?: number; location?: string; voice_channel_id?: string; description?: string; cover_style?: string }

const styleEnum = ["none", ...Object.keys(bannerStyles)];
const wantsArt = (style?: string) => !!style && style !== "none" && style in bannerStyles;
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
        banner_style: { type: "string", enum: styleEnum, description: "Generate a banner image from the title in this style. Use fenris (red and black) by default for anything event-like or exciting; none for routine notices or if the user doesn't want an image." },
        title_font: { type: "string", enum: ["none", ...Object.keys(fonts)], description: "Fancy Unicode font for the title. Use none unless the user asks for a fancy font or a very hype announcement; never upside_down unless asked." },
        divider: { type: "string", enum: Object.keys(dividers), description: "Emoji divider above and below the body. none unless it suits a big announcement or the user asks." },
        post_at: { type: "string", description: "Empty string to post right away. To schedule, the server-local time formatted exactly YYYY-MM-DD HH:MM (24-hour)." },
        repeat: { type: "string", enum: ["none", "daily", "weekly", "biweekly", "monthly"], description: "Make it recurring (needs post_at for the first post). none unless the user asks for a repeating announcement." },
      },
      required: ["channel_id", "title", "body", "color", "ping", "banner_style", "title_font", "divider", "post_at", "repeat"],
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
        cover_style: { type: "string", enum: styleEnum, description: "Generate a cover image showing the name and date in this style. Default to fenris unless the user asks otherwise." },
      },
      required: ["name", "start", "hours", "location", "voice_channel_id", "description", "cover_style"],
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

/** Not a proposal: saves (or removes) the asker's own birthday right away. It only ever touches the person talking. */
export const birthdayTool: Anthropic.Beta.BetaTool = {
  name: "save_my_birthday",
  description: "Save or remove the birthday of the person talking to you (never anyone else), so Fenris announces it on the day. Use it when someone tells you their birthday or asks you to remember/forget it. Only month and day are stored; never ask for the year.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      month: { type: "integer", description: "1 to 12 (0 when removing)" },
      day: { type: "integer", description: "1 to 31 (0 when removing)" },
      remove: { type: "boolean", description: "true to forget their birthday" },
    },
    required: ["month", "day", "remove"],
  },
};
export interface BirthdayInput { month: number; day: number; remove: boolean }

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

function announcementData(a: AnnouncementInput): AnnouncementData {
  return {
    channelId: a.channel_id,
    title: a.title.slice(0, 200),
    body: a.body.slice(0, 3800),
    color: colorFor(a.color),
    ping: a.ping,
    bannerStyle: wantsArt(a.banner_style) ? a.banner_style : undefined,
    titleFont: a.title_font && a.title_font !== "none" ? a.title_font : undefined,
    divider: a.divider && a.divider !== "none" ? a.divider : undefined,
  };
}

const repeatOf = (a: AnnouncementInput) => (a.repeat && a.repeat !== "none" ? a.repeat as Repeat : undefined);

/** When the announcement should go out, or null for right away. Throws if the time is unusable. */
function postTime(a: AnnouncementInput): Date | null {
  if (!a.post_at?.trim()) {
    if (repeatOf(a)) throw new UserError("A repeating announcement needs a time for its first post.");
    return null;
  }
  const at = parseDateTime(a.post_at, config.timezone());
  if (!at) throw new UserError(`I couldn't work out when to post it. ${DATE_HELP}`);
  if (at.getTime() < Date.now()) throw new UserError("That posting time is in the past.");
  return at;
}

async function eventArt(guild: Guild, e: EventInput, start: Date): Promise<Buffer | null> {
  if (!wantsArt(e.cover_style)) return null;
  return renderBanner({
    title: e.name, subtitle: formatShort(start, config.timezone()), style: e.cover_style, emblemImage: await serverIcon(guild),
  });
}

function withArt(embed: EmbedBuilder, art: Buffer | null): { embed: EmbedBuilder; files: AttachmentBuilder[] } {
  if (!art) return { embed, files: [] };
  embed.setImage("attachment://banner.png");
  return { embed, files: [new AttachmentBuilder(art, { name: "banner.png" })] };
}

/** Checks the proposal and builds the preview shown above the Confirm button. */
export async function preview(guild: Guild, action: Action): Promise<{ summary: string; embed: EmbedBuilder; files: AttachmentBuilder[] }> {
  switch (action.kind) {
    case "announcement": {
      const a = action.input;
      const ch = textChannel(guild, a.channel_id);
      const ping = a.ping && a.ping !== "none" ? ` and ping @${a.ping}` : "";
      const at = postTime(a);
      const { message, embed } = await buildAnnouncement(guild, announcementData(a));
      const files = (message.files ?? []) as AttachmentBuilder[];
      const again = repeatOf(a) ? `, then ${repeatLabel(repeatOf(a))}` : "";
      const when = at ? `Schedule this announcement for ${discordTime(at)}${again} in <#${ch.id}>${ping}?` : `Post this announcement in <#${ch.id}>${ping}?`;
      return { summary: when, embed, files };
    }
    case "event": {
      const e = action.input;
      const start = parseDateTime(e.start, config.timezone());
      if (!start) throw new UserError(`I couldn't work out the start time. ${DATE_HELP}`);
      if (start.getTime() < Date.now()) throw new UserError("That event time is in the past.");
      const where = e.voice_channel_id ? `<#${e.voice_channel_id}>` : e.location || "See event details";
      return {
        summary: "Create this event on the server calendar?",
        ...withArt(brandEmbed(colors.red).setTitle(`📅 ${e.name}`).setDescription([
          e.description,
          "",
          `**When:** ${discordTime(start)} (${e.hours || 2} h)`,
          `**Where:** ${where}`,
        ].join("\n")), await eventArt(guild, e, start)),
      };
    }
    case "poll": {
      const p = action.input;
      const ch = textChannel(guild, p.channel_id);
      if (p.answers.length < 2 || p.answers.length > 10) throw new UserError("A poll needs between 2 and 10 answers.");
      return {
        summary: `Start this poll in <#${ch.id}>?`,
        files: [],
        embed: brandEmbed(colors.red).setTitle(`📊 ${p.question}`).setDescription(
          p.answers.map((a, i) => `${i + 1}. ${a}`).join("\n") +
          `\n\nOpen for ${p.hours || 24} h${p.multiple ? " · multiple choice" : ""}`),
      };
    }
  }
}

/** Carries out a confirmed proposal. Returns a short result message for the person. */
export async function execute(guild: Guild, action: Action, userId: string): Promise<string> {
  switch (action.kind) {
    case "announcement": {
      const a = action.input;
      const ch = textChannel(guild, a.channel_id);
      const at = postTime(a);
      if (at) {
        const item = await addScheduled(guild.id, userId, at, announcementData(a), repeatOf(a));
        return `Scheduled for ${discordTime(at)} (${discordTime(at, "R")})${repeatOf(a) ? `, then ${repeatLabel(repeatOf(a))}` : ""}. ID \`${item.id}\`, manage it with \`/schedule\`.`;
      }
      const { message } = await buildAnnouncement(guild, announcementData(a));
      const msg = await ch.send(message);
      return `Done! ${msg.url}`;
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
        image: (await eventArt(guild, e, start)) ?? undefined,
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
      return `Done! ${created.url}`;
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
      return `Done! ${msg.url}`;
    }
  }
}
