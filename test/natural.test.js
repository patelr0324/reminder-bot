const test = require('node:test');
const assert = require('node:assert');
const { parseNatural } = require('../lib/natural');

test('every day at 9am uses hour 9 in timezone', () => {
  const r = parseNatural('every day at 9am', 'America/New_York');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.result.kind, 'daily');
  assert.strictEqual(r.result.repeatHour, 9);
  assert.strictEqual(r.result.repeatMinute, 0);
});

test('in 2 hours is one-shot delay', () => {
  const r = parseNatural('in 2 hours', null);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.result.kind, 'delay');
  assert.ok(r.result.triggerAt > Date.now());
});
