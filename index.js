require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits
} = require('discord.js');

const db = require('./database');
const {
  MAX_DELAY_SEC,
  MIN_EVERY_SEC,
  nextDailyLocalMillis,
  nextWeeklyLocalMillis,
  nextTriggerAfterFire,
  advanceAfterSkip,
  snoozeExplanation
} = require('./lib/schedule');
const { parseNatural } = require('./lib/natural');
const { botSay } = require('./lib/bot-text');
const { kindLabel, formatTriggerAt, previewText } = require('./lib/reminder-format');

function isValidIanaTimezone(tz) {
  if (typeof tz !== 'string') return false;
  const trimmed = tz.trim();
  if (!trimmed) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function normalizeMessage(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim();
}

function getUserTimezone(userId, cb) {
  db.get(`SELECT timezone FROM user_settings WHERE userId = ?`, [userId], (err, row) => {
    if (err) return cb(err);
    cb(null, row?.timezone ?? null);
  });
}

function reminderActionRow(reminderId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`r:snooze1h:${reminderId}`)
      .setLabel(botSay('+1 hour'))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`r:snooze1d:${reminderId}`)
      .setLabel(botSay('+1 day'))
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`r:skip:${reminderId}`)
      .setLabel(botSay('skip next'))
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`r:stop:${reminderId}`)
      .setLabel(botSay('stop'))
      .setStyle(ButtonStyle.Danger)
  );
}

function finalizeAfterSend(reminder) {
  const next = nextTriggerAfterFire(reminder);
  if (next == null) {
    db.run(`DELETE FROM reminders WHERE id = ?`, [reminder.id], (err) => {
      if (err) console.error(err);
    });
  } else {
    db.run(`UPDATE reminders SET triggerAt = ? WHERE id = ?`, [next, reminder.id], (err) => {
      if (err) console.error(err);
    });
  }
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.login(process.env.TOKEN);

setInterval(() => {
  const now = Date.now();

  db.all(`SELECT * FROM reminders WHERE triggerAt <= ?`, [now], (err, rows) => {
    if (err) return console.error(err);

    rows.forEach((reminder) => {
      const channel = client.channels.cache.get(reminder.channelId);

      if (!channel) {
        db.run(`DELETE FROM reminders WHERE id = ?`, [reminder.id]);
        return;
      }

      channel
        .send({
          content: `<@${reminder.userId}> ${reminder.message}`,
          components: [reminderActionRow(reminder.id)]
        })
        .then(() => finalizeAfterSend(reminder))
        .catch((sendErr) => console.error(sendErr));
    });
  });
}, 5000);

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isButton() && interaction.customId.startsWith('r:')) {
      return handleReminderButton(interaction);
    }

    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'remind') {
      await interaction.deferReply();
      const sub = interaction.options.getSubcommand();
      if (sub === 'in') return handleRemindIn(interaction);
      if (sub === 'daily') return handleRemindDaily(interaction);
      if (sub === 'weekly') return handleRemindWeekly(interaction);
      if (sub === 'natural') return handleRemindNatural(interaction);
      return interaction.editReply(botSay('unknown subcommand.'));
    }

    if (interaction.commandName === 'settings') {
      return handleSettings(interaction);
    }

    if (interaction.commandName === 'reminders') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const sub = interaction.options.getSubcommand();
      if (sub === 'list') return handleRemindersList(interaction);
      if (sub === 'cancel') return handleRemindersCancel(interaction);
      if (sub === 'clear') return handleRemindersClear(interaction);
      if (sub === 'edit-channel') return handleRemindersEditChannel(interaction);
      if (sub === 'edit-message') return handleRemindersEditMessage(interaction);
      if (sub === 'edit-time') return handleRemindersEditTime(interaction);
      if (sub === 'edit-interval') return handleRemindersEditInterval(interaction);
      return interaction.editReply(botSay('unknown subcommand.'));
    }

    if (interaction.commandName === 'timezone') {
      await interaction.deferReply();

      const raw = interaction.options.getString('iana');
      if (!isValidIanaTimezone(raw)) {
        return interaction.editReply(
          botSay('unknown timezone. use an IANA name, e.g. `America/New_York` or `Europe/Berlin`.')
        );
      }

      const timezone = raw.trim();

      db.run(
        `INSERT OR REPLACE INTO user_settings (userId, timezone) VALUES (?, ?)`,
        [interaction.user.id, timezone],
        async (e) => {
          if (e) {
            console.error(e);
            return interaction.editReply(botSay('failed to save timezone'));
          }
          await interaction.editReply(`${botSay('timezone set to')} \`${timezone}\`.`);
        }
      );
    }
  } catch (e) {
    console.error(e);
  }
});

function handleRemindersList(interaction) {
  getUserTimezone(interaction.user.id, (err, tz) => {
    if (err) {
      console.error(err);
      tz = null;
    }
    db.all(
      `SELECT * FROM reminders WHERE userId = ? ORDER BY triggerAt ASC`,
      [interaction.user.id],
      (e, rows) => {
        if (e) {
          console.error(e);
          return interaction.editReply(botSay('could not load reminders.'));
        }
        if (!rows.length) {
          return interaction.editReply(botSay('you have no active reminders.'));
        }
        const blocks = rows.map((row) => {
          const kind = kindLabel(row);
          const when = formatTriggerAt(row.triggerAt, tz);
          const prev = previewText(row.message, 120);
          const head = botSay(`#${row.id} · ${kind} · next ${when}`);
          return `${head} · <#${row.channelId}>\n${prev}`;
        });
        let body = blocks.join('\n\n');
        if (body.length > 1950) {
          body = `${body.slice(0, 1930)}\n${botSay('(truncated.)')}`;
        }
        interaction.editReply(`${botSay('your active reminders:')}\n\n${body}`);
      }
    );
  });
}

function handleRemindersCancel(interaction) {
  const id = interaction.options.getInteger('id');
  db.run(
    `DELETE FROM reminders WHERE id = ? AND userId = ?`,
    [id, interaction.user.id],
    function onDelete(err) {
      if (err) {
        console.error(err);
        return interaction.editReply(botSay('could not cancel reminder.'));
      }
      if (this.changes === 0) {
        return interaction.editReply(
          botSay('no reminder with that id, or it does not belong to you.')
        );
      }
      interaction.editReply(botSay(`cancelled reminder #${id}.`));
    }
  );
}

function handleRemindersClear(interaction) {
  const ok = interaction.options.getBoolean('confirm');
  if (!ok) {
    return interaction.editReply(botSay('set confirm to true to delete all your reminders.'));
  }
  db.run(`DELETE FROM reminders WHERE userId = ?`, [interaction.user.id], function onClear(err) {
    if (err) {
      console.error(err);
      return interaction.editReply(botSay('could not clear reminders.'));
    }
    interaction.editReply(botSay(`deleted ${this.changes} reminder(s).`));
  });
}

function handleRemindersEditChannel(interaction) {
  const id = interaction.options.getInteger('id');
  const channel = interaction.options.getChannel('channel');
  if (!channel || !interaction.guildId || channel.guildId !== interaction.guildId) {
    return interaction.editReply(botSay('pick a channel in this server.'));
  }
  if (!channel.isTextBased()) {
    return interaction.editReply(botSay('that channel cannot receive messages.'));
  }
  const me = interaction.guild?.members?.me;
  if (me && channel.permissionsFor(me)?.has(PermissionFlagsBits.SendMessages) === false) {
    return interaction.editReply(botSay('i cannot send messages in that channel.'));
  }
  db.run(
    `UPDATE reminders SET channelId = ? WHERE id = ? AND userId = ?`,
    [channel.id, id, interaction.user.id],
    function onCh(err) {
      if (err) {
        console.error(err);
        return interaction.editReply(botSay('could not update channel.'));
      }
      if (this.changes === 0) {
        return interaction.editReply(
          botSay('no reminder with that id, or it does not belong to you.')
        );
      }
      interaction.editReply(`${botSay(`reminder #${id} will post in`)} <#${channel.id}>`);
    }
  );
}

function handleRemindersEditMessage(interaction) {
  const id = interaction.options.getInteger('id');
  const message = normalizeMessage(interaction.options.getString('message'));
  if (!message) {
    return interaction.editReply(botSay('message cannot be empty.'));
  }
  db.run(
    `UPDATE reminders SET message = ? WHERE id = ? AND userId = ?`,
    [message, id, interaction.user.id],
    function onMsg(err) {
      if (err) {
        console.error(err);
        return interaction.editReply(botSay('could not update message.'));
      }
      if (this.changes === 0) {
        return interaction.editReply(
          botSay('no reminder with that id, or it does not belong to you.')
        );
      }
      interaction.editReply(`${botSay(`updated reminder #${id}.`)}\n${message}`);
    }
  );
}

function handleRemindersEditTime(interaction) {
  const id = interaction.options.getInteger('id');
  const seconds = interaction.options.getInteger('seconds');
  const hour = interaction.options.getInteger('hour');
  const minute = interaction.options.getInteger('minute');
  const weekday = interaction.options.getInteger('weekday');

  const hasSchedule = hour != null;
  const hasMinuteOnly = hour == null && minute != null;

  if (seconds != null && (hasSchedule || weekday != null || hasMinuteOnly)) {
    return interaction.editReply(botSay('use either seconds or hour/minute, not both.'));
  }

  if (hasMinuteOnly) {
    return interaction.editReply(botSay('set hour when changing minute, or use seconds.'));
  }

  if (seconds != null) {
    const triggerAt = Date.now() + seconds * 1000;
    db.run(
      `UPDATE reminders SET triggerAt = ? WHERE id = ? AND userId = ?`,
      [triggerAt, id, interaction.user.id],
      function onSec(err) {
        if (err) {
          console.error(err);
          return interaction.editReply(botSay('could not update time.'));
        }
        if (this.changes === 0) {
          return interaction.editReply(
            botSay('no reminder with that id, or it does not belong to you.')
          );
        }
        interaction.editReply(botSay(`reminder #${id} next fires in ${seconds}s.`));
      }
    );
    return;
  }

  if (hour != null) {
    const min = minute ?? 0;
    db.get(
      `SELECT * FROM reminders WHERE id = ? AND userId = ?`,
      [id, interaction.user.id],
      (err, row) => {
        if (err) {
          console.error(err);
          return interaction.editReply(botSay('could not load reminder.'));
        }
        if (!row) {
          return interaction.editReply(
            botSay('no reminder with that id, or it does not belong to you.')
          );
        }
        const kind = row.kind || (row.intervalMs ? 'interval' : 'delay');
        if (kind !== 'daily' && kind !== 'weekly') {
          return interaction.editReply(
            botSay('hour/minute only apply to daily or weekly reminders. use seconds instead.')
          );
        }
        const tz = row.iana_tz;
        if (!tz) {
          return interaction.editReply(botSay('that reminder has no timezone; cancel and recreate it.'));
        }
        if (kind === 'daily') {
          const triggerAt = nextDailyLocalMillis(tz, hour, min);
          db.run(
            `UPDATE reminders SET repeatHour = ?, repeatMinute = ?, triggerAt = ? WHERE id = ? AND userId = ?`,
            [hour, min, triggerAt, id, interaction.user.id],
            function onDaily(e) {
              if (e) {
                console.error(e);
                return interaction.editReply(botSay('could not update schedule.'));
              }
              if (this.changes === 0) {
                return interaction.editReply(botSay('could not update reminder.'));
              }
              interaction.editReply(
                botSay(
                  `reminder #${id} is daily at ${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')} (${tz}).`
                )
              );
            }
          );
          return;
        }
        const wd = weekday ?? row.repeatWeekday ?? 1;
        const triggerAt = nextWeeklyLocalMillis(tz, wd, hour, min);
        db.run(
          `UPDATE reminders SET repeatHour = ?, repeatMinute = ?, repeatWeekday = ?, triggerAt = ? WHERE id = ? AND userId = ?`,
          [hour, min, wd, triggerAt, id, interaction.user.id],
          function onWeekly(e) {
            if (e) {
              console.error(e);
              return interaction.editReply(botSay('could not update schedule.'));
            }
            if (this.changes === 0) {
              return interaction.editReply(botSay('could not update reminder.'));
            }
            interaction.editReply(
              botSay(
                `reminder #${id} is weekly (weekday ${wd}) at ${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')} (${tz}).`
              )
            );
          }
        );
      }
    );
    return;
  }

  return interaction.editReply(
    botSay('provide seconds for the next ping, or hour (and optional minute) for daily/weekly.')
  );
}

function handleRemindersEditInterval(interaction) {
  const id = interaction.options.getInteger('id');
  const every = interaction.options.getInteger('every_seconds');
  db.get(
    `SELECT * FROM reminders WHERE id = ? AND userId = ?`,
    [id, interaction.user.id],
    (err, row) => {
      if (err) {
        console.error(err);
        return interaction.editReply(botSay('could not load reminder.'));
      }
      if (!row) {
        return interaction.editReply(
          botSay('no reminder with that id, or it does not belong to you.')
        );
      }
      const kind = row.kind || (row.intervalMs ? 'interval' : 'delay');
      if (kind !== 'interval') {
        return interaction.editReply(
          botSay('that reminder is not an interval repeat. use `/remind in` with every_seconds to make one.')
        );
      }
      const intervalMs = every * 1000;
      db.run(
        `UPDATE reminders SET intervalMs = ? WHERE id = ? AND userId = ?`,
        [intervalMs, id, interaction.user.id],
        function onIv(e) {
          if (e) {
            console.error(e);
            return interaction.editReply(botSay('could not update interval.'));
          }
          if (this.changes === 0) {
            return interaction.editReply(botSay('could not update reminder.'));
          }
          interaction.editReply(botSay(`reminder #${id} now repeats every ${every}s.`));
        }
      );
    }
  );
}

function handleRemindIn(interaction) {
  const seconds = interaction.options.getInteger('seconds');
  const everySec = interaction.options.getInteger('every_seconds');
  const message = normalizeMessage(interaction.options.getString('message'));

  if (!message) {
    return interaction.editReply(botSay('message cannot be empty.'));
  }
  if (seconds < 1 || seconds > MAX_DELAY_SEC) {
    return interaction.editReply(
      botSay(`first delay must be between 1 and ${MAX_DELAY_SEC} seconds.`)
    );
  }
  if (everySec != null && everySec < MIN_EVERY_SEC) {
    return interaction.editReply(botSay(`repeat interval must be at least ${MIN_EVERY_SEC} seconds.`));
  }

  const triggerAt = Date.now() + seconds * 1000;
  const intervalMs = everySec != null ? everySec * 1000 : null;
  const kind = everySec != null ? 'interval' : 'delay';

  db.run(
    `INSERT INTO reminders (userId, channelId, message, triggerAt, intervalMs, kind, repeatHour, repeatMinute, repeatWeekday, iana_tz)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL)`,
    [interaction.user.id, interaction.channel.id, message, triggerAt, intervalMs, kind],
    async function onInsert(err) {
      if (err) {
        console.error(err);
        return interaction.editReply(botSay('failed to save reminder'));
      }
      const id = this.lastID;
      if (everySec != null) {
        await interaction.editReply(
          `${botSay(`reminder **#${id}**: first in **${seconds}s**, then every **${everySec}s**.`)}\n${message}`
        );
      } else {
        await interaction.editReply(
          `${botSay(`reminder **#${id}** in **${seconds}s**.`)}\n${message}`
        );
      }
    }
  );
}

function handleRemindDaily(interaction) {
  const hour = interaction.options.getInteger('hour');
  const minute = interaction.options.getInteger('minute') ?? 0;
  const message = normalizeMessage(interaction.options.getString('message'));

  if (!message) {
    return interaction.editReply(botSay('message cannot be empty.'));
  }

  getUserTimezone(interaction.user.id, (err, tz) => {
    if (err) {
      console.error(err);
      return interaction.editReply(botSay('could not read your timezone.'));
    }
    if (!tz) {
      return interaction.editReply(
        botSay(
          'set your timezone first with `/timezone iana:Your/City` (e.g. `America/Chicago`).'
        )
      );
    }

    const triggerAt = nextDailyLocalMillis(tz, hour, minute);

    db.run(
      `INSERT INTO reminders (userId, channelId, message, triggerAt, intervalMs, kind, repeatHour, repeatMinute, repeatWeekday, iana_tz)
       VALUES (?, ?, ?, ?, NULL, 'daily', ?, ?, NULL, ?)`,
      [interaction.user.id, interaction.channel.id, message, triggerAt, hour, minute, tz],
      async function onInsert(e) {
        if (e) {
          console.error(e);
          return interaction.editReply(botSay('failed to save reminder'));
        }
        const id = this.lastID;
        const hm = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        await interaction.editReply(
          `${botSay(`daily reminder **#${id}** at **${hm}** (`)}\`${tz}\`${botSay(`).`)}\n${message}`
        );
      }
    );
  });
}

function handleRemindNatural(interaction) {
  const when = interaction.options.getString('when');
  const message = normalizeMessage(interaction.options.getString('message'));

  if (!message) {
    return interaction.editReply(botSay('message cannot be empty.'));
  }

  getUserTimezone(interaction.user.id, (err, tz) => {
    if (err) {
      console.error(err);
      return interaction.editReply(botSay('could not read your timezone.'));
    }

    const parsed = parseNatural(when, tz);
    if (!parsed.ok) {
      return interaction.editReply(botSay(parsed.error));
    }

    const r = parsed.result;

    function doInsert(params) {
      db.run(
        `INSERT INTO reminders (userId, channelId, message, triggerAt, intervalMs, kind, repeatHour, repeatMinute, repeatWeekday, iana_tz)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params,
        async function onInsert(e) {
          if (e) {
            console.error(e);
            return interaction.editReply(botSay('failed to save reminder'));
          }
          const id = this.lastID;
          await interaction.editReply(
            `${botSay(`natural reminder **#${id}** (${parsed.summary})`)}\n${message}`
          );
        }
      );
    }

    if (r.kind === 'delay') {
      return doInsert([
        interaction.user.id,
        interaction.channel.id,
        message,
        r.triggerAt,
        null,
        'delay',
        null,
        null,
        null,
        null
      ]);
    }
    if (r.kind === 'daily') {
      return doInsert([
        interaction.user.id,
        interaction.channel.id,
        message,
        r.triggerAt,
        null,
        'daily',
        r.repeatHour,
        r.repeatMinute,
        null,
        r.iana_tz
      ]);
    }
    if (r.kind === 'weekly') {
      return doInsert([
        interaction.user.id,
        interaction.channel.id,
        message,
        r.triggerAt,
        null,
        'weekly',
        r.repeatHour,
        r.repeatMinute,
        r.repeatWeekday,
        r.iana_tz
      ]);
    }
    return interaction.editReply(botSay('could not build that reminder.'));
  });
}

function handleSettings(interaction) {
  interaction.deferReply({ flags: MessageFlags.Ephemeral }).then(() => {
    getUserTimezone(interaction.user.id, (err, tz) => {
      if (err) {
        console.error(err);
        return interaction.editReply(botSay('could not load settings.'));
      }
      db.get(
        `SELECT COUNT(*) AS c FROM reminders WHERE userId = ?`,
        [interaction.user.id],
        (e, row) => {
          if (e) {
            console.error(e);
            return interaction.editReply(botSay('could not load your reminders.'));
          }
          const count = row?.c ?? 0;
          const tzLine = tz
            ? `${botSay('**timezone:**')} \`${tz}\``
            : botSay('**timezone:** not set — use `/timezone`.');
          const text = [
            botSay('**reminder settings**'),
            tzLine,
            `${botSay('**active reminders:**')} ${count}`,
            '',
            botSay('**`/remind natural` examples**'),
            botSay('`tomorrow 9am` · `in 45 minutes` · `next friday 5pm`'),
            botSay(
              '`every day at 8:30` · `every monday at 6pm` · `every week on thursday at noon`'
            ),
            '',
            botSay(
              'calendar-style phrases need `/timezone` first. after you snooze, daily/weekly reminders still use your usual local time on later pings.'
            ),
            botSay(
              'use `/reminders list` to view ids; `edit-channel`, `edit-message`, `edit-time`, `edit-interval` to change them.'
            )
          ].join('\n');
          interaction.editReply(text);
        }
      );
    });
  });
}

function handleRemindWeekly(interaction) {
  const weekday = interaction.options.getInteger('weekday');
  const hour = interaction.options.getInteger('hour');
  const minute = interaction.options.getInteger('minute') ?? 0;
  const message = normalizeMessage(interaction.options.getString('message'));

  if (!message) {
    return interaction.editReply(botSay('message cannot be empty.'));
  }

  getUserTimezone(interaction.user.id, (err, tz) => {
    if (err) {
      console.error(err);
      return interaction.editReply(botSay('could not read your timezone.'));
    }
    if (!tz) {
      return interaction.editReply(
        botSay(
          'set your timezone first with `/timezone iana:Your/City` (e.g. `Europe/Berlin`).'
        )
      );
    }

    const triggerAt = nextWeeklyLocalMillis(tz, weekday, hour, minute);

    db.run(
      `INSERT INTO reminders (userId, channelId, message, triggerAt, intervalMs, kind, repeatHour, repeatMinute, repeatWeekday, iana_tz)
       VALUES (?, ?, ?, ?, NULL, 'weekly', ?, ?, ?, ?)`,
      [interaction.user.id, interaction.channel.id, message, triggerAt, hour, minute, weekday, tz],
      async function onInsert(e) {
        if (e) {
          console.error(e);
          return interaction.editReply(botSay('failed to save reminder'));
        }
        const id = this.lastID;
        const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        const dayLabel = days[weekday - 1] ?? weekday;
        const hm = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        await interaction.editReply(
          `${botSay(`weekly reminder **#${id}** on **${dayLabel}** at **${hm}** (`)}\`${tz}\`${botSay(`).`)}\n${message}`
        );
      }
    );
  });
}

async function handleReminderButton(interaction) {
  const parts = interaction.customId.split(':');
  if (parts.length !== 3 || parts[0] !== 'r') return;

  const action = parts[1];
  const reminderId = parseInt(parts[2], 10);
  if (!Number.isFinite(reminderId)) return;

  const validActions = ['stop', 'snooze1h', 'snooze1d', 'skip'];
  if (!validActions.includes(action)) {
    return interaction.reply({ content: botSay('unknown action.'), flags: MessageFlags.Ephemeral });
  }

  db.get(`SELECT * FROM reminders WHERE id = ?`, [reminderId], async (err, row) => {
    if (err) {
      console.error(err);
      return interaction.reply({ content: botSay('database error.'), flags: MessageFlags.Ephemeral });
    }
    if (!row) {
      return interaction.reply({ content: botSay('that reminder no longer exists.'), flags: MessageFlags.Ephemeral });
    }
    if (row.userId !== interaction.user.id) {
      return interaction.reply({
        content: botSay('that reminder belongs to someone else.'),
        flags: MessageFlags.Ephemeral
      });
    }

    await interaction.deferUpdate();

    const stripComponents = () =>
      interaction.message.edit({ components: [] }).catch(() => {});

    if (action === 'stop') {
      db.run(`DELETE FROM reminders WHERE id = ?`, [reminderId], async (e) => {
        if (e) console.error(e);
        await stripComponents();
        await interaction.followUp({ content: botSay('reminder stopped.'), flags: MessageFlags.Ephemeral });
      });
      return;
    }

    if (action === 'snooze1h') {
      const next = Date.now() + 60 * 60 * 1000;
      const note = snoozeExplanation(row);
      db.run(`UPDATE reminders SET triggerAt = ? WHERE id = ?`, [next, reminderId], async (e) => {
        if (e) console.error(e);
        await stripComponents();
        await interaction.followUp({
          content: botSay(note ? `snoozed 1 hour. ${note}` : 'snoozed 1 hour.'),
          flags: MessageFlags.Ephemeral
        });
      });
      return;
    }

    if (action === 'snooze1d') {
      const next = Date.now() + 24 * 60 * 60 * 1000;
      const note = snoozeExplanation(row);
      db.run(`UPDATE reminders SET triggerAt = ? WHERE id = ?`, [next, reminderId], async (e) => {
        if (e) console.error(e);
        await stripComponents();
        await interaction.followUp({
          content: botSay(note ? `snoozed 1 day. ${note}` : 'snoozed 1 day.'),
          flags: MessageFlags.Ephemeral
        });
      });
      return;
    }

    if (action === 'skip') {
      const kind = row.kind || (row.intervalMs ? 'interval' : 'delay');
      if (kind === 'delay') {
        db.run(`DELETE FROM reminders WHERE id = ?`, [reminderId], async (e) => {
          if (e) console.error(e);
          await stripComponents();
          await interaction.followUp({ content: botSay('reminder dismissed.'), flags: MessageFlags.Ephemeral });
        });
        return;
      }

      const next = advanceAfterSkip(row);
      if (next == null) {
        db.run(`DELETE FROM reminders WHERE id = ?`, [reminderId], async (e) => {
          if (e) console.error(e);
          await stripComponents();
          await interaction.followUp({ content: botSay('reminder removed.'), flags: MessageFlags.Ephemeral });
        });
        return;
      }

      db.run(`UPDATE reminders SET triggerAt = ? WHERE id = ?`, [next, reminderId], async (e) => {
        if (e) console.error(e);
        await stripComponents();
        await interaction.followUp({
          content: botSay('skipped to the next scheduled time.'),
          flags: MessageFlags.Ephemeral
        });
      });
      return;
    }
  });
}
