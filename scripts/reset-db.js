require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const applySchema = require('../db/schema');

const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(__dirname, '..', 'reminders.db');

if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
  console.log('removed:', dbPath);
}

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new sqlite3.Database(dbPath);
applySchema(db, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  db.close((closeErr) => {
    if (closeErr) {
      console.error(closeErr);
      process.exit(1);
    }
    console.log('empty database created:', dbPath);
  });
});
