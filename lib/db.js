// SQLite storage (Node's built-in node:sqlite, no install needed).
const { DatabaseSync } = require('node:sqlite');
const path = require('path'), fs = require('fs');

function open(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, 'publicis-intelligence.db'));
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users(
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL DEFAULT '',
      pass TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', credits REAL NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(
      token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS ledger(
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, ts INTEGER NOT NULL, kind TEXT NOT NULL,
      model TEXT, route TEXT, input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0, searches INTEGER DEFAULT 0,
      usd REAL DEFAULT 0, credits REAL NOT NULL, balance_after REAL NOT NULL, note TEXT, by_user TEXT);
    CREATE INDEX IF NOT EXISTS ledger_user_ts ON ledger(user_id, ts);
    CREATE TABLE IF NOT EXISTS docs(
      col TEXT NOT NULL, id TEXT NOT NULL, owner TEXT, data TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(col,id));
    CREATE TABLE IF NOT EXISTS conversations(
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL DEFAULT '',
      model TEXT, messages TEXT NOT NULL DEFAULT '[]', updated_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS conv_user ON conversations(user_id, updated_at);
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  return db;
}
module.exports = { open };
