require('dotenv').config();
const { REST, Routes, ApplicationCommandOptionType, ChannelType } = require('discord.js');

const commands = [
  {
    name: 'remind',
    description: 'set a reminder',
    options: [
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'in',
        description: 'remind after a number of seconds',
        options: [
          {
            name: 'seconds',
            type: ApplicationCommandOptionType.Integer,
            description: 'seconds until the first reminder',
            required: true,
            min_value: 1,
            max_value: 365 * 24 * 60 * 60
          },
          {
            name: 'message',
            type: ApplicationCommandOptionType.String,
            description: 'reminder text',
            required: true,
            min_length: 1,
            max_length: 2000
          },
          {
            name: 'every_seconds',
            type: ApplicationCommandOptionType.Integer,
            description: 'repeat every N seconds after the first',
            required: false,
            min_value: 5,
            max_value: 365 * 24 * 60 * 60
          }
        ]
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'daily',
        description: 'every day at a time in your timezone (use /timezone first)',
        options: [
          {
            name: 'hour',
            type: ApplicationCommandOptionType.Integer,
            description: 'hour (0–23)',
            required: true,
            min_value: 0,
            max_value: 23
          },
          {
            name: 'message',
            type: ApplicationCommandOptionType.String,
            description: 'reminder text',
            required: true,
            min_length: 1,
            max_length: 2000
          },
          {
            name: 'minute',
            type: ApplicationCommandOptionType.Integer,
            description: 'minute (0–59), default 0',
            required: false,
            min_value: 0,
            max_value: 59
          }
        ]
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'weekly',
        description: 'every week on a weekday at a local time',
        options: [
          {
            name: 'weekday',
            type: ApplicationCommandOptionType.Integer,
            description: '1 = monday … 7 = sunday',
            required: true,
            min_value: 1,
            max_value: 7
          },
          {
            name: 'hour',
            type: ApplicationCommandOptionType.Integer,
            description: 'hour (0–23)',
            required: true,
            min_value: 0,
            max_value: 23
          },
          {
            name: 'message',
            type: ApplicationCommandOptionType.String,
            description: 'reminder text',
            required: true,
            min_length: 1,
            max_length: 2000
          },
          {
            name: 'minute',
            type: ApplicationCommandOptionType.Integer,
            description: 'minute (0–59), default 0',
            required: false,
            min_value: 0,
            max_value: 59
          }
        ]
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'natural',
        description: 'natural language: e.g. tomorrow 9am, in 2 hours, every monday at 6pm',
        options: [
          {
            name: 'when',
            type: ApplicationCommandOptionType.String,
            description: 'when to remind (see /settings for examples)',
            required: true,
            min_length: 1,
            max_length: 500
          },
          {
            name: 'message',
            type: ApplicationCommandOptionType.String,
            description: 'reminder text',
            required: true,
            min_length: 1,
            max_length: 2000
          }
        ]
      }
    ]
  },
  {
    name: 'reminders',
    description: 'view or manage your active reminders',
    options: [
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'list',
        description: 'list your active reminders (next fire time and ids)'
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'cancel',
        description: 'cancel one reminder by id (from /reminders list)',
        options: [
          {
            name: 'id',
            type: ApplicationCommandOptionType.Integer,
            description: 'reminder id',
            required: true,
            min_value: 1
          }
        ]
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'clear',
        description: 'delete all of your reminders everywhere',
        options: [
          {
            name: 'confirm',
            type: ApplicationCommandOptionType.Boolean,
            description: 'must be true to delete all',
            required: true
          }
        ]
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'edit-channel',
        description: 'send future pings for this reminder in another channel',
        options: [
          {
            name: 'id',
            type: ApplicationCommandOptionType.Integer,
            description: 'reminder id',
            required: true,
            min_value: 1
          },
          {
            name: 'channel',
            type: ApplicationCommandOptionType.Channel,
            description: 'text channel',
            required: true,
            channel_types: [ChannelType.GuildText, ChannelType.GuildAnnouncement]
          }
        ]
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'edit-message',
        description: 'change the reminder text',
        options: [
          {
            name: 'id',
            type: ApplicationCommandOptionType.Integer,
            description: 'reminder id',
            required: true,
            min_value: 1
          },
          {
            name: 'message',
            type: ApplicationCommandOptionType.String,
            description: 'new text',
            required: true,
            min_length: 1,
            max_length: 2000
          }
        ]
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'edit-time',
        description: 'next ping in N seconds, or new hour/minute for daily/weekly',
        options: [
          {
            name: 'id',
            type: ApplicationCommandOptionType.Integer,
            description: 'reminder id',
            required: true,
            min_value: 1
          },
          {
            name: 'seconds',
            type: ApplicationCommandOptionType.Integer,
            description: 'seconds until the next ping (any kind)',
            required: false,
            min_value: 1,
            max_value: 365 * 24 * 60 * 60
          },
          {
            name: 'hour',
            type: ApplicationCommandOptionType.Integer,
            description: 'for daily/weekly: hour 0-23',
            required: false,
            min_value: 0,
            max_value: 23
          },
          {
            name: 'minute',
            type: ApplicationCommandOptionType.Integer,
            description: 'for daily/weekly: minute 0-59 (default 0 if hour set)',
            required: false,
            min_value: 0,
            max_value: 59
          },
          {
            name: 'weekday',
            type: ApplicationCommandOptionType.Integer,
            description: 'for weekly: 1=mon … 7=sun (optional, keeps current if omitted)',
            required: false,
            min_value: 1,
            max_value: 7
          }
        ]
      },
      {
        type: ApplicationCommandOptionType.Subcommand,
        name: 'edit-interval',
        description: 'change how often an interval reminder repeats',
        options: [
          {
            name: 'id',
            type: ApplicationCommandOptionType.Integer,
            description: 'reminder id',
            required: true,
            min_value: 1
          },
          {
            name: 'every_seconds',
            type: ApplicationCommandOptionType.Integer,
            description: 'seconds between pings',
            required: true,
            min_value: 5,
            max_value: 365 * 24 * 60 * 60
          }
        ]
      }
    ]
  },
  {
    name: 'settings',
    description: 'view your timezone, active reminders, and phrase examples'
  },
  {
    name: 'timezone',
    description: 'set your IANA timezone for local-time reminders',
    options: [
      {
        name: 'iana',
        type: ApplicationCommandOptionType.String,
        description: 'iana name, e.g. america/new_york or europe/london',
        required: true
      }
    ]
  }
];

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

const CLIENT_ID = process.env.CLIENT_ID || '1490413381201428653';
const GUILD_ID = process.env.DISCORD_GUILD_ID;

(async () => {
  try {
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log('guild commands registered (instant) for guild', GUILD_ID);
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log(
        'global commands registered — available in all servers (discord may take up to ~1 hour to sync)'
      );
    }
    if (!process.env.CLIENT_ID) {
      console.warn('tip: set CLIENT_ID in .env so deploy does not rely on the default id');
    }
  } catch (err) {
    console.error(err);
  }
})();
