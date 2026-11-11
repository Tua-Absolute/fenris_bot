# Fenris Bot

An all-in-one bot for running a Discord server: eye-catching announcements, Discord calendar events, polls, and Claude-powered chat replies.

## Roadmap

1. **Foundation** (done): project setup, slash command framework, `/ping`, invite link.
2. **Management commands** (done): `/announce`, `/event`, `/poll`. Scheduled posting comes later, once the bot has storage.
3. **Claude in chat** (done): mention the bot to talk to it; plain-English requests turn into announcements, events, and polls after a Confirm button.
4. **Asset generation** (done): free banner and event cover images in five styles. Paid image models (Gemini, ChatGPT) are deliberately left out for now.

## Setup (about 10 minutes)

You need [Node.js 20+](https://nodejs.org/).

### 1. Create the bot in Discord
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and click **New Application**. Name it.
2. On **General Information**, copy the **Application ID**.
3. On **Bot**, click **Reset Token** and copy the token. Treat it like a password: never share or commit it.
4. Still on **Bot**, turn on **Message Content Intent** (needed later for chat replies).

### 2. Configure
```bash
npm install
cp .env.example .env
```
Fill in `.env` with the token, Application ID, and your server ID (in Discord: Settings > Advanced > Developer Mode on, then right-click your server > Copy Server ID).

### 3. Invite it and run it
```bash
npm run invite            # prints the invite link; open it and pick your server
npm run deploy-commands   # registers the slash commands in your server
npm run dev               # starts the bot (auto-restarts on code changes)
```
Type `/ping` in your server. A "Pong!" embed means everything works.

## Commands

| Command | Who can use it | What it does |
|---|---|---|
| `/ping` | Everyone | Checks the bot is online. |
| `/announce` | Manage Messages | Opens a form for a title, message, and footer, then posts a styled embed. Options: channel, color, banner image, @here/@everyone, a role ping, and a link button. |
| `/event create` | Manage Events | Adds an event to the server calendar. `start` understands things like `fri 8pm`, `tomorrow 7:30pm`, `11/14 8pm`, or `2026-11-14 20:00`. Can use a voice channel or a place/link, a cover image, and post an announcement with the event link. |
| `/event list` | Manage Events | Shows upcoming events with times in each viewer's own time zone. |
| `/event cancel` | Manage Events | Cancels an event (pick it from the suggestions). |
| `/poll` | Everyone | Starts a native Discord poll with 2 to 10 answers, a duration, and optional multiple choice. |
| `/banner` | Everyone | Generates a banner image from a title and optional subtitle, in a choice of styles. |

**Generated art:** `/announce` has a `banner` option and `/event create` has a `cover_style` option that make a matching image automatically (title, server name or event date, and the Fenris emblem). Claude chat adds them to its drafts too. Images are drawn on your own computer, so they cost nothing.

![Example banner](assets/branding/example-banner.png)

Times typed into commands are read in the `TIMEZONE` from `.env` (default `America/Chicago`). You can change who sees each command in Server Settings > Integrations > Fenris.

**After pulling new commands, run `npm run deploy-commands` again** so Discord knows about them.

## Claude chat (optional)

Mention Fenris (or reply to one of its messages) and it answers using Claude, with the last 20 messages of the channel as context. Ask it things like *"@Fenris announce game night Friday at 8 in #general and make an event for it"* and it drafts the post, shows a preview, and waits for you to press **Confirm**. Only the person who asked can confirm, and they need the same permission the slash command would need.

To turn it on:
1. At [console.anthropic.com](https://console.anthropic.com/), add some prepaid credit, then create a key under **API Keys**.
2. In the [Developer Portal](https://discord.com/developers/applications), open your app > **Bot** and switch on **Message Content Intent**.
3. Put the key after `ANTHROPIC_API_KEY=` in `.env` and restart the bot. The terminal says "Claude chat is ON".

Costs stay predictable: chat is off without a key, each person has a short cooldown, and `CHAT_DAILY_LIMIT` caps replies per day (default 200). `CLAUDE_MODEL` picks the model: `claude-opus-5-5` (default) is the smartest, `claude-haiku-5-5` costs a small fraction as much.

## Running it 24/7

While this is a concept, running it on your own computer with `npm run build && npm start` is free. When you want it always on, a free-tier VM (for example Oracle Cloud Always Free) or a paid host like Railway both work, since it is a normal long-running Node process.

## Adding a command

Create a file in `src/commands/`, export a `Command`, add it to the list in `src/commands/index.ts`, then run `npm run deploy-commands`.
