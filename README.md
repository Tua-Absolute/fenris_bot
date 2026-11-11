# Fenris Bot

An all-in-one bot for running a Discord server: eye-catching announcements, Discord calendar events, polls, and Claude-powered chat replies.

## Roadmap

1. **Foundation** (done): project setup, slash command framework, `/ping`, invite link.
2. **Management commands** (done): `/announce`, `/event`, `/poll`. Scheduled posting comes later, once the bot has storage.
3. **Claude in chat**: mention the bot to talk to it; plain-English requests turn into actions after a confirm button.
4. **Asset generation**: banner and cover images built from templates. Paid image models (Gemini, ChatGPT) are deliberately left out for now.

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

Times typed into commands are read in the `TIMEZONE` from `.env` (default `America/Chicago`). You can change who sees each command in Server Settings > Integrations > Fenris.

**After pulling new commands, run `npm run deploy-commands` again** so Discord knows about them.

## Running it 24/7

While this is a concept, running it on your own computer with `npm run build && npm start` is free. When you want it always on, a free-tier VM (for example Oracle Cloud Always Free) or a paid host like Railway both work, since it is a normal long-running Node process.

## Adding a command

Create a file in `src/commands/`, export a `Command`, add it to the list in `src/commands/index.ts`, then run `npm run deploy-commands`.
