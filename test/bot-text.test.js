const test = require('node:test');
const assert = require('node:assert');
const { botSay } = require('../lib/bot-text');

test('botSay lowercases and strips emoji', () => {
  assert.strictEqual(botSay('Hello WORLD'), 'hello world');
  assert.strictEqual(botSay('ping '), 'ping ');
  assert.strictEqual(botSay('a'), 'a');
  assert.strictEqual(botSay(`x\u{1F642}y`), 'xy');
});
