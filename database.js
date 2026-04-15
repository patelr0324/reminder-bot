require('dotenv').config();
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const applySchema = require('./db/schema');

const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(__dirname, 'reminders.db');

const db = new sqlite3.Database(dbPath);
applySchema(db);

module.exports = db;
module.exports.dbPath = dbPath;
module.exports.applySchema = applySchema;
