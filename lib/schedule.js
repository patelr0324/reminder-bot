const { DateTime } = require('luxon');

const MAX_DELAY_SEC = 365 * 24 * 60 * 60;
const MIN_EVERY_SEC = 5;

function nextDailyLocalMillis(ianaTz, hour, minute) {
  const now = DateTime.now().setZone(ianaTz);
  let next = now.set({ hour, minute, second: 0, millisecond: 0 });
  if (next <= now) next = next.plus({ days: 1 });
  return next.toMillis();
}

/** Luxon: Monday = 1 … Sunday = 7 */
function nextWeeklyLocalMillis(ianaTz, weekdayLuxon, hour, minute) {
  const now = DateTime.now().setZone(ianaTz);
  let next = now.set({ weekday: weekdayLuxon, hour, minute, second: 0, millisecond: 0 });
  if (next <= now) next = next.plus({ weeks: 1 });
  return next.toMillis();
}

/**
 * After a recurring reminder fires, compute the next UTC millis.
 * @param {object} row - reminder row from DB
 */
function nextTriggerAfterFire(row) {
  const kind = row.kind || (row.intervalMs ? 'interval' : 'delay');

  if (kind === 'delay') return null;

  if (kind === 'interval' && row.intervalMs > 0) {
    return Date.now() + row.intervalMs;
  }

  if (kind === 'daily') {
    const h = row.repeatHour ?? 0;
    const m = row.repeatMinute ?? 0;
    return nextDailyLocalMillis(row.iana_tz, h, m);
  }

  if (kind === 'weekly') {
    const wd = row.repeatWeekday ?? 1;
    const h = row.repeatHour ?? 0;
    const m = row.repeatMinute ?? 0;
    return nextWeeklyLocalMillis(row.iana_tz, wd, h, m);
  }

  return null;
}

/**
 * Advance schedule once (e.g. "skip next" without deleting the series).
 */
function advanceAfterSkip(row) {
  return nextTriggerAfterFire(row);
}

/** Short note for snooze confirmation (daily/weekly keep clock/calendar; interval keeps cadence). */
function snoozeExplanation(row) {
  const kind = row.kind || (row.intervalMs ? 'interval' : 'delay');
  if (kind === 'daily' || kind === 'weekly') {
    return 'future pings still follow your saved clock/calendar time.';
  }
  if (kind === 'interval') {
    return 'after this snooze, the next fires still use your repeat interval.';
  }
  return '';
}

module.exports = {
  MAX_DELAY_SEC,
  MIN_EVERY_SEC,
  nextDailyLocalMillis,
  nextWeeklyLocalMillis,
  nextTriggerAfterFire,
  advanceAfterSkip,
  snoozeExplanation
};
