const { DateTime } = require('luxon');

function kindLabel(row) {
  const k = row.kind || (row.intervalMs ? 'interval' : 'delay');
  if (k === 'delay') return 'once';
  if (k === 'interval') {
    const s = Math.round(row.intervalMs / 1000);
    return `every ${s}s`;
  }
  if (k === 'daily') return 'daily';
  if (k === 'weekly') return 'weekly';
  return String(k);
}

function formatTriggerAt(triggerAt, tz) {
  const ms = typeof triggerAt === 'number' ? triggerAt : parseInt(triggerAt, 10);
  if (Number.isNaN(ms)) return '?';
  if (tz) {
    return DateTime.fromMillis(ms).setZone(tz).toFormat('yyyy-MM-dd HH:mm');
  }
  return `${DateTime.fromMillis(ms).toUTC().toFormat('yyyy-MM-dd HH:mm')} utc`;
}

function previewText(message, maxLen) {
  if (typeof message !== 'string') return '';
  const one = message.replace(/\s+/g, ' ').trim();
  if (one.length <= maxLen) return one;
  return `${one.slice(0, maxLen - 1)}…`;
}

module.exports = { kindLabel, formatTriggerAt, previewText };
