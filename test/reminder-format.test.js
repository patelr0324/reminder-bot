const test = require('node:test');
const assert = require('node:assert');
const { kindLabel, formatTriggerAt, previewText } = require('../lib/reminder-format');

test('kindLabel for delay and interval', () => {
  assert.strictEqual(kindLabel({ kind: 'delay' }), 'once');
  assert.strictEqual(kindLabel({ kind: 'interval', intervalMs: 60000 }), 'every 60s');
});

test('formatTriggerAt uses timezone when set', () => {
  const s = formatTriggerAt(0, 'UTC');
  assert.ok(s.includes('1970'));
});

test('previewText truncates', () => {
  assert.strictEqual(previewText('abc', 2), 'a…');
  assert.strictEqual(previewText('hello', 10), 'hello');
});
