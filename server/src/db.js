import Database from 'libsql';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WRITABLE_DIR } from './runtime.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || WRITABLE_DIR || path.join(here, '..', 'data');
mkdirSync(DATA_DIR, { recursive: true });

// With TURSO_DATABASE_URL set, the local file is an embedded replica of a hosted Turso database:
// reads are local, writes go to Turso, so data survives restarts and redeploys (needed on Vercel).
// Without it, it's a plain local SQLite file.
const TURSO_URL = process.env.TURSO_DATABASE_URL;
const SYNC_EVERY_MS = Number(process.env.TURSO_SYNC_SECONDS || 15) * 1000;
const dbFile = process.env.DB_PATH || path.join(DATA_DIR, TURSO_URL ? 'replica.db' : 'internhunt.db');

export const db = TURSO_URL
  ? new Database(dbFile, { syncUrl: TURSO_URL, authToken: process.env.TURSO_AUTH_TOKEN })
  : new Database(dbFile);

let lastSync = 0;
/** Pull other instances' writes from Turso. Cheap no-op without Turso or when synced recently. */
export function syncDb({ force = false } = {}) {
  if (!TURSO_URL || (!force && Date.now() - lastSync < SYNC_EVERY_MS)) return;
  lastSync = Date.now();
  try {
    db.sync();
  } catch (err) {
    console.error('[db] sync with Turso failed:', err.message);
  }
}
syncDb({ force: true });

if (!TURSO_URL) db.exec('PRAGMA journal_mode = WAL;');
try {
  db.exec('PRAGMA foreign_keys = ON;');
} catch {
  /* not supported over a remote connection */
}

db.exec(`

  CREATE TABLE IF NOT EXISTS jobs (
    id              TEXT PRIMARY KEY,          -- "<source>:<sourceJobId>"
    dedup_key       TEXT NOT NULL,
    source          TEXT NOT NULL,
    target_key      TEXT NOT NULL,
    company         TEXT NOT NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    url             TEXT NOT NULL,
    locations       TEXT,
    loc_tag         TEXT NOT NULL,             -- india_onsite | remote_india | remote_worldwide
    city            TEXT,
    category        TEXT NOT NULL,             -- sde | web | data
    level           TEXT NOT NULL,             -- intern | entry | unspecified
    min_years       INTEGER,
    employment_type TEXT,
    salary          TEXT,
    tags            TEXT,
    posted_at       TEXT,
    first_seen      TEXT NOT NULL,
    last_seen       TEXT NOT NULL,
    is_active       INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS idx_jobs_dedup  ON jobs(dedup_key);
  CREATE INDEX IF NOT EXISTS idx_jobs_filter ON jobs(is_active, category, level, loc_tag);
  CREATE INDEX IF NOT EXISTS idx_jobs_target ON jobs(target_key);

  CREATE TABLE IF NOT EXISTS tracking (
    job_id     TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
    status     TEXT NOT NULL,                  -- saved | applied | interview | offer | rejected
    notes      TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS source_runs (
    target_key  TEXT PRIMARY KEY,
    source      TEXT NOT NULL,
    label       TEXT NOT NULL,
    ok          INTEGER NOT NULL,
    error       TEXT,
    fetched     INTEGER NOT NULL DEFAULT 0,
    kept        INTEGER NOT NULL DEFAULT 0,
    finished_at TEXT NOT NULL
  );

  -- Companies you've reported as scam/fake: all their jobs are hidden, now and in future refreshes.
  CREATE TABLE IF NOT EXISTS blocked_companies (
    company_key TEXT PRIMARY KEY,
    company     TEXT NOT NULL,
    reason      TEXT NOT NULL,
    created_at  TEXT NOT NULL
  );

  -- Your reports on individual jobs: scam | fake | no_reply | expired
  CREATE TABLE IF NOT EXISTS job_reports (
    job_id      TEXT NOT NULL,
    company_key TEXT NOT NULL,
    reason      TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    PRIMARY KEY (job_id, reason)
  );

  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Columns added after the first release: add them to existing databases.
const cols = new Set(db.prepare('PRAGMA table_info(jobs)').all().map((c) => c.name));
for (const [name, type] of [['trust', "TEXT NOT NULL DEFAULT 'company'"], ['flags', "TEXT NOT NULL DEFAULT '[]'"], ['reposts', 'INTEGER NOT NULL DEFAULT 0'], ['company_key', "TEXT NOT NULL DEFAULT ''"]]) {
  if (!cols.has(name)) db.exec(`ALTER TABLE jobs ADD COLUMN ${name} ${type}`);
}
const runCols = new Set(db.prepare('PRAGMA table_info(source_runs)').all().map((c) => c.name));
if (!runCols.has('blocked')) db.exec('ALTER TABLE source_runs ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0');
db.exec("UPDATE jobs SET company_key = lower(trim(company)) WHERE company_key = ''");
db.exec('CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company_key)');

export const companyKey = (name) => String(name || '').trim().toLowerCase();

export function getMeta(key) {
  return db.prepare('SELECT value FROM meta WHERE key = ?').get(key)?.value ?? null;
}

export function setMeta(key, value) {
  db.prepare('INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    value
  );
}

export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
