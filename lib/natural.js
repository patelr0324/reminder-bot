const { parse } = require('chrono-node');
const { DateTime } = require('luxon');
const { nextDailyLocalMillis, nextWeeklyLocalMillis, MAX_DELAY_SEC } = require('./schedule');

const MAX_MS_AHEAD = MAX_DELAY_SEC * 1000;

/** Luxon Monday = 1 … Sunday = 7 */
const WEEKDAY_NAMES = {
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
  sunday: 7,
  sun: 7
};

function parseChrono(when, ref, opt) {
  try {
    return parse(when, ref, opt);
  } catch {
    return [];
  }
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Prefer chrono's hour/minute; avoids TZ skew from converting ParsedResult.date(). */
function hourMinuteFromParsed(results, userTz) {
  const start = results[0].start;
  if (start.isCertain('hour')) {
    return {
      hour: start.get('hour'),
      minute: start.isCertain('minute') ? start.get('minute') : 0
    };
  }
  const dt = DateTime.fromJSDate(results[0].date()).setZone(userTz);
  return { hour: dt.hour, minute: dt.minute };
}

/**
 * @param {string} whenRaw
 * @param {string | null} userTz IANA timezone from user_settings (optional for pure-relative phrases)
 * @returns {{ ok: true, summary: string, result: object } | { ok: false, error: string }}
 */
function parseNatural(whenRaw, userTz) {
  const when = whenRaw.trim();
  if (!when) return { ok: false, error: 'Empty `when` text.' };

  const opt = { forwardDate: true };
  const ref =
    userTz != null && userTz !== ''
      ? { instant: DateTime.now().setZone(userTz).toJSDate(), timezone: userTz }
      : new Date();

  const mDaily = /^every\s+day\s+(?:at\s+)?(.+)$/i.exec(when);
  if (mDaily) {
    if (!userTz) {
      return { ok: false, error: 'set `/timezone` first for daily recurring reminders.' };
    }
    const timeText = mDaily[1].trim();
    const results = parseChrono(timeText, ref, opt);
    if (!results.length) {
      return { ok: false, error: 'could not parse the time of day (try `9am`, `14:30`, `noon`).' };
    }
    const { hour, minute } = hourMinuteFromParsed(results, userTz);
    const triggerAt = nextDailyLocalMillis(userTz, hour, minute);
    return {
      ok: true,
      summary: `daily at ${pad2(hour)}:${pad2(minute)}`,
      result: {
        kind: 'daily',
        triggerAt,
        repeatHour: hour,
        repeatMinute: minute,
        iana_tz: userTz
      }
    };
  }

  const mWeek =
    /^every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\s+(?:at\s+)?(.+)$/i.exec(
      when
    );
  if (mWeek) {
    if (!userTz) {
      return { ok: false, error: 'set `/timezone` first for weekly recurring reminders.' };
    }
    const dayToken = mWeek[1].toLowerCase();
    const timeText = mWeek[2].trim();
    const weekdayLuxon = WEEKDAY_NAMES[dayToken];
    if (!weekdayLuxon) {
      return { ok: false, error: 'could not read the weekday in that phrase.' };
    }
    const results = parseChrono(timeText, ref, opt);
    if (!results.length) {
      return { ok: false, error: 'could not parse the time (try `6pm` or `18:30`).' };
    }
    const { hour, minute } = hourMinuteFromParsed(results, userTz);
    const triggerAt = nextWeeklyLocalMillis(userTz, weekdayLuxon, hour, minute);
    return {
      ok: true,
      summary: `weekly on ${mWeek[1]} at ${pad2(hour)}:${pad2(minute)}`,
      result: {
        kind: 'weekly',
        triggerAt,
        repeatHour: hour,
        repeatMinute: minute,
        repeatWeekday: weekdayLuxon,
        iana_tz: userTz
      }
    };
  }

  const mWeekOn = /^every\s+week\s+on\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\s+(?:at\s+)?(.+)$/i.exec(
    when
  );
  if (mWeekOn) {
    return parseNatural(`every ${mWeekOn[1]} at ${mWeekOn[2]}`, userTz);
  }

  const results = parseChrono(when, ref, opt);
  if (!results.length) {
    return {
      ok: false,
      error: userTz
        ? 'could not parse that. try `tomorrow 9am`, `in 2 hours`, `every day at 8pm`, or `every Monday at 6:30pm`.'
        : 'could not parse that. set `/timezone` for local phrases, or try relative times like `in 15 minutes` / `in 2 hours`.'
    };
  }

  const triggerAt = results[0].date().getTime();
  const now = Date.now();
  if (triggerAt <= now + 5000) {
    return { ok: false, error: 'that time is in the past or too soon. try `tomorrow`, `next Friday`, or `in 1 hour`.' };
  }
  if (triggerAt > now + MAX_MS_AHEAD) {
    return { ok: false, error: 'that time is more than a year away.' };
  }

  return {
    ok: true,
    summary: 'one-time',
    result: {
      kind: 'delay',
      triggerAt
    }
  };
}

module.exports = { parseNatural };
