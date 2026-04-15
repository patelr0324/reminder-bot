/**
 * Applies SQLite DDL for the reminder bot. Used by database.js and tooling scripts.
 * Older DB files created before `intervalMs` need ALTER TABLE — CREATE TABLE IF NOT EXISTS
 * does not add columns to existing tables.
 * @param {import('sqlite3').Database} db
 * @param {(err?: Error) => void} [done]
 */
function applySchema(db, done) {
  db.serialize(() => {
    db.run(
      `
      CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT,
        channelId TEXT,
        message TEXT,
        triggerAt INTEGER,
        intervalMs INTEGER,
        kind TEXT,
        repeatHour INTEGER,
        repeatMinute INTEGER,
        repeatWeekday INTEGER,
        iana_tz TEXT
      )
    `,
      (err) => {
        if (err) return done && done(err);
      }
    );

    db.run(
      `
      CREATE TABLE IF NOT EXISTS user_settings (
        userId TEXT PRIMARY KEY,
        timezone TEXT NOT NULL
      )
    `,
      (err) => {
        if (err) return done && done(err);
      }
    );

    db.all(`PRAGMA table_info(reminders)`, (err, rows) => {
      if (err) return done && done(err);

      const names = new Set(Array.isArray(rows) ? rows.map((r) => r.name) : []);
      const pending = [];

      if (!names.has('intervalMs')) {
        pending.push('ALTER TABLE reminders ADD COLUMN intervalMs INTEGER');
      }
      if (!names.has('kind')) {
        pending.push('ALTER TABLE reminders ADD COLUMN kind TEXT');
      }
      if (!names.has('repeatHour')) {
        pending.push('ALTER TABLE reminders ADD COLUMN repeatHour INTEGER');
      }
      if (!names.has('repeatMinute')) {
        pending.push('ALTER TABLE reminders ADD COLUMN repeatMinute INTEGER');
      }
      if (!names.has('repeatWeekday')) {
        pending.push('ALTER TABLE reminders ADD COLUMN repeatWeekday INTEGER');
      }
      if (!names.has('iana_tz')) {
        pending.push('ALTER TABLE reminders ADD COLUMN iana_tz TEXT');
      }

      function runNext(i) {
        if (i >= pending.length) {
          if (done) done();
          return;
        }
        db.run(pending[i], (alterErr) => {
          if (alterErr) return done && done(alterErr);
          runNext(i + 1);
        });
      }

      runNext(0);
    });
  });
}

module.exports = applySchema;
