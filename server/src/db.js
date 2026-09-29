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
// Without it, or if Turso can't be reached, it's a plain local SQLite file.
const TURSO_URL = process.env.TURSO_DATABASE_URL;
const SYNC_EVERY_MS = Number(process.env.TURSO_SYNC_SECONDS || 15) * 1000;
const localFile = process.env.DB_PATH || path.join(DATA_DIR, 'internhunt.db');

/** Why Turso couldn't be used (shown by /api/health), or null. */
export let dbError = null;
let usingTurso = false;
const SETUP_REV = '2';

function setup(d) {
  try {
    d.exec('PRAGMA foreign_keys = ON;');
  } catch {
    /* not supported over a remote connection */
  }
  // Fast path for cold starts: once a database has been set up, skip the schema statements below.
  // With Turso every one of them is a network write, which made the first request after idle slow.
  // Bump SETUP_REV whenever the schema below changes.
  try {
    if (d.prepare("SELECT value FROM meta WHERE key = 'setup_rev'").get()?.value === SETUP_REV) return;
  } catch {
    /* fresh database: no meta table yet */
  }
  d.exec(`

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

    -- Accounts (Google sign-in). id is Google's stable user id ("sub").
    CREATE TABLE IF NOT EXISTS users (
      id         TEXT PRIMARY KEY,
      email      TEXT NOT NULL,
      name       TEXT,
      picture    TEXT,
      created_at TEXT NOT NULL,
      last_login TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,               -- sha256 of the token the browser holds
      user_id    TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    -- Per-person tracker and reports (the older tracking / job_reports / blocked_companies tables
    -- were shared by every visitor and are no longer used).
    CREATE TABLE IF NOT EXISTS user_tracking (
      user_id    TEXT NOT NULL,
      job_id     TEXT NOT NULL,
      status     TEXT NOT NULL,                  -- saved | applied | interview | offer | rejected | no_reply
      notes      TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, job_id)
    );
    CREATE TABLE IF NOT EXISTS user_reports (
      user_id     TEXT NOT NULL,
      job_id      TEXT NOT NULL,
      company_key TEXT NOT NULL,
      reason      TEXT NOT NULL,                 -- scam | fake | no_reply | expired
      created_at  TEXT NOT NULL,
      PRIMARY KEY (user_id, job_id, reason)
    );
    CREATE INDEX IF NOT EXISTS idx_user_reports_company ON user_reports(company_key, reason);
    CREATE TABLE IF NOT EXISTS user_blocked (
      user_id     TEXT NOT NULL,
      company_key TEXT NOT NULL,
      company     TEXT NOT NULL,
      reason      TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      PRIMARY KEY (user_id, company_key)
    );
  `);

  // Columns added after the first release: add them to existing databases.
  const cols = new Set(d.prepare('PRAGMA table_info(jobs)').all().map((c) => c.name));
  for (const [name, type] of [
    ['trust', "TEXT NOT NULL DEFAULT 'company'"], ['flags', "TEXT NOT NULL DEFAULT '[]'"], ['reposts', 'INTEGER NOT NULL DEFAULT 0'],
    ['company_key', "TEXT NOT NULL DEFAULT ''"], ['exp', 'INTEGER NOT NULL DEFAULT 0'], ['languages', "TEXT NOT NULL DEFAULT '[]'"],
    ['deadline', 'TEXT'], ['closed_at', 'TEXT'], ['app_status', 'TEXT'],
  ]) {
    if (!cols.has(name)) d.exec(`ALTER TABLE jobs ADD COLUMN ${name} ${type}`);
  }
  const runCols = new Set(d.prepare('PRAGMA table_info(source_runs)').all().map((c) => c.name));
  if (!runCols.has('blocked')) d.exec('ALTER TABLE source_runs ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0');
  d.exec("UPDATE jobs SET company_key = lower(trim(company)) WHERE company_key = ''");
  d.exec('CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company_key)');
  d.exec('CREATE INDEX IF NOT EXISTS idx_jobs_browse ON jobs(level, is_active, category, exp)');

  // v2: levels became intern/job (+ experience bucket) and roles got more specific. Map old rows so
  // the app works right away; the next refresh (forced below) reclassifies everything properly.
  const version = d.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get()?.value;
  if (version !== '2') {
    d.exec(`
      UPDATE jobs SET level = 'job' WHERE level IN ('entry', 'unspecified');
      UPDATE jobs SET category = 'software' WHERE category = 'sde';
      UPDATE jobs SET category = 'fullstack' WHERE category = 'web';
      UPDATE jobs SET closed_at = last_seen WHERE is_active = 0 AND closed_at IS NULL;
      DELETE FROM meta WHERE key = 'last_refresh';
      INSERT INTO meta (key, value) VALUES ('schema_version', '2')
        ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    `);
  }
  d.prepare("INSERT INTO meta (key, value) VALUES ('setup_rev', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(SETUP_REV);
}

function open() {
  if (TURSO_URL) {
    let d;
    try {
      d = new Database(path.join(DATA_DIR, 'replica.db'), { syncUrl: TURSO_URL, authToken: process.env.TURSO_AUTH_TOKEN });
      d.sync();
      setup(d);
      usingTurso = true;
      return d;
    } catch (err) {
      dbError = `Turso: ${err.message}`.slice(0, 500);
      console.error('[db] could not use Turso, falling back to a local database:', dbError);
      try {
        d?.close();
      } catch {
        /* ignore */
      }
    }
  }
  const d = new Database(localFile);
  d.exec('PRAGMA journal_mode = WAL;');
  setup(d);
  return d;
}

const raw = open();

// Statements are written with named parameters (@name, bound from an object). A Turso embedded
// replica forwards writes to the server without those names, so every value arrived as NULL.
// Rewrite them to positional "?" parameters, which work the same locally and on Turso.
function prepare(sql) {
  const names = [];
  const text = sql.replace(/@([A-Za-z_]\w*)/g, (_, name) => {
    names.push(name);
    return '?';
  });
  const stmt = raw.prepare(text);
  if (!names.length) return stmt;
  const bind = (args) => {
    const values = args[0] && typeof args[0] === 'object' && !Array.isArray(args[0]) ? args[0] : {};
    return names.map((n) => {
      const v = values[n];
      return v === undefined ? null : typeof v === 'boolean' ? Number(v) : v;
    });
  };
  // Bind as one array: a lone NULL argument would be read as a (bad) parameter object.
  return {
    run: (...args) => stmt.run(bind(args)),
    get: (...args) => stmt.get(bind(args)),
    all: (...args) => stmt.all(bind(args)),
  };
}

export const db = {
  prepare,
  exec: (sql) => raw.exec(sql),
  sync: () => raw.sync(),
  close: () => raw.close(),
};

export const dbInfo = () => ({ database: usingTurso ? 'turso' : 'local', error: dbError });

let lastSync = Date.now();
/** Pull other instances' writes from Turso. Cheap no-op without Turso or when synced recently. */
export function syncDb({ force = false } = {}) {
  if (!usingTurso || (!force && Date.now() - lastSync < SYNC_EVERY_MS)) return;
  lastSync = Date.now();
  try {
    db.sync();
  } catch (err) {
    console.error('[db] sync with Turso failed:', err.message);
  }
}

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
  // A replica sends each write to Turso on its own, so BEGIN/COMMIT don't span them there
  // ("cannot rollback - no transaction is active"). Run the statements one by one instead.
  if (usingTurso) return fn();
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
