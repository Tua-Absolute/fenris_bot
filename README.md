# Fenris Bot

An all-in-one bot for running a Discord server: eye-catching announcements, Discord calendar events, polls, and Claude-powered chat replies.

## Roadmap

1. **Foundation** (this step): project setup, slash command framework, `/ping`, invite link.
2. **Management commands**: `/announce` (styled embeds, scheduled posts), `/event` (Discord scheduled events), `/poll` (native Discord polls).
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

## Running it 24/7

While this is a concept, running it on your own computer with `npm run build && npm start` is free. When you want it always on, a free-tier VM (for example Oracle Cloud Always Free) or a paid host like Railway both work, since it is a normal long-running Node process.

## Adding a command

Create a file in `src/commands/`, export a `Command`, add it to the list in `src/commands/index.ts`, then run `npm run deploy-commands`.
