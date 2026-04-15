const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

function clearDatabaseModule() {
  const resolved = require.resolve('../database');
  delete require.cache[resolved];
}

test('creates expected tables at DATABASE_PATH', async (t) => {
  const dbFile = path.join(os.tmpdir(), `reminder-bot-test-${Date.now()}.db`);
  t.after(() => {
    try {
      fs.unlinkSync(dbFile);
    } catch {
      /* ignore */
    }
  });

  process.env.DATABASE_PATH = dbFile;
  clearDatabaseModule();
  const db = require('../database');

  const tables = await new Promise((resolve, reject) => {
    db.all(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
      (err, rows) => (err ? reject(err) : resolve(rows))
    );
  });

  const names = tables.map((r) => r.name);
  assert.ok(names.includes('reminders'));
  assert.ok(names.includes('user_settings'));
});

test('can insert and read a reminder row', async (t) => {
  const dbFile = path.join(os.tmpdir(), `reminder-bot-test-${Date.now()}.db`);
  t.after(() => {
    try {
      fs.unlinkSync(dbFile);
    } catch {
      /* ignore */
    }
  });

  process.env.DATABASE_PATH = dbFile;
  clearDatabaseModule();
  const db = require('../database');

  await new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO reminders (userId, channelId, message, triggerAt, intervalMs)
       VALUES (?, ?, ?, ?, ?)`,
      ['u1', 'c1', 'hello', Date.now() + 60_000, 30_000],
      (err) => (err ? reject(err) : resolve())
    );
  });

  const row = await new Promise((resolve, reject) => {
    db.get(`SELECT userId, message, intervalMs FROM reminders WHERE userId = ?`, ['u1'], (err, r) =>
      err ? reject(err) : resolve(r)
    );
  });

  assert.strictEqual(row.userId, 'u1');
  assert.strictEqual(row.message, 'hello');
  assert.strictEqual(row.intervalMs, 30_000);
});

test('migrates legacy reminders table missing intervalMs', async (t) => {
  const sqlite3 = require('sqlite3').verbose();
  const applySchema = require('../db/schema');

  const dbFile = path.join(os.tmpdir(), `reminder-bot-test-${Date.now()}.db`);
  t.after(() => {
    try {
      fs.unlinkSync(dbFile);
    } catch {
      /* ignore */
    }
  });

  await new Promise((resolve, reject) => {
    const raw = new sqlite3.Database(dbFile);
    raw.run(
      `
      CREATE TABLE reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT,
        channelId TEXT,
        message TEXT,
        triggerAt INTEGER
      )
    `,
      (err) => {
        if (err) return reject(err);
        raw.close((e) => (e ? reject(e) : resolve()));
      }
    );
  });

  const db = new sqlite3.Database(dbFile);
  await new Promise((resolve, reject) => {
    applySchema(db, (err) => (err ? reject(err) : resolve()));
  });

  await new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO reminders (userId, channelId, message, triggerAt, intervalMs)
       VALUES (?, ?, ?, ?, ?)`,
      ['legacy', 'c1', 'x', Date.now(), 5000],
      (err) => (err ? reject(err) : resolve())
    );
  });

  const row = await new Promise((resolve, reject) => {
    db.get(`SELECT intervalMs FROM reminders WHERE userId = ?`, ['legacy'], (err, r) =>
      err ? reject(err) : resolve(r)
    );
  });

  assert.strictEqual(row.intervalMs, 5000);

  await new Promise((resolve, reject) => {
    db.close((err) => (err ? reject(err) : resolve()));
  });
});
