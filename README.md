# reminder-bot

A Discord reminder bot with one-time, repeating, daily, weekly, and natural-language reminders.

## Features

- Slash commands for creating and managing reminders
- Recurring schedules (`every N seconds`, daily, weekly)
- Natural-language parsing (examples: `tomorrow 9am`, `in 2 hours`)
- Per-user timezone support
- SQLite persistence for reminders and user settings
- Reminder action buttons (`+1 hour`, `+1 day`, `skip next`, `stop`)

## Requirements

- Node.js 18+ (Node 20 recommended)
- A Discord bot application with token
- Bot invited to your server with command permissions

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create your env file:

```bash
copy .env.example .env
```

3. Fill in `.env`:

```env
TOKEN=your_discord_bot_token
CLIENT_ID=your_application_id
# Optional:
# DATABASE_PATH=./reminders.db
# DISCORD_GUILD_ID=123456789012345678
```

4. Initialize the database:

```bash
npm run db:init
```

5. Register slash commands:

```bash
npm run deploy
```

6. Start the bot:

```bash
npm start
```

## How To Restart The Bot

If the bot is already running in a terminal:

1. Press `Ctrl + C` in that terminal
2. Start it again:

```bash
npm start
```

If it is not currently running, just run `npm start`.

## Common Commands

- `npm start` - start bot
- `npm run deploy` - deploy slash commands
- `npm run db:init` - initialize database schema
- `npm run db:reset` - reset database (destructive)
- `npm test` - run tests

## Using Slash Commands

After deploy completes, use slash commands in Discord:

- `/remind in`
- `/remind daily`
- `/remind weekly`
- `/remind natural`
- `/reminders ...` (view/manage active reminders)

## Troubleshooting

### `injecting env (0) from .env`

Dotenv did not load variables from `.env`. Check:

- `.env` exists in project root
- variables are named correctly (`TOKEN`, `CLIENT_ID`)
- no extra quotes or spaces around `=`

### `Error: getaddrinfo ENOTFOUND discord.com`

DNS/network issue from your machine (not usually bot logic). Try:

- verify internet/VPN connection
- run `nslookup discord.com`
- switch DNS/network and restart the bot

## Notes

- `.env`, `node_modules`, and `*.db` are gitignored.
- The default SQLite database is `reminders.db` in the project root unless `DATABASE_PATH` is set.
